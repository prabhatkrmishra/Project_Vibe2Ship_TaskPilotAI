import * as UserRepository from "../repositories/userRepository.js";
import * as TaskRepository from "../repositories/taskRepository.js";
import * as GoalRepository from "../repositories/goalRepository.js";
import * as ChatRepository from "../repositories/chatRepository.js";
import * as DailyPlanRepository from "../repositories/dailyPlanRepository.js";
import * as FocusSessionRepository from "../repositories/focusSessionRepository.js";
import * as AIUsageRepository from "../repositories/aiUsageRepository.js";
import {
    connectDB,
} from "../db/mongodb.js";
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {JWT_SECRET} from "../config/env.js";
import {encryptToken, decryptToken} from "../lib/crypto.js";
import {sendLoginWarningEmail, sendPasswordResetEmail, sendVerificationEmail} from "./emailService.js";

export const registerUser = async (email: string, password: string, name: string, address: string) => {
    await connectDB();
    const existingUser = await UserRepository.findUserByEmail(email);
    if (existingUser) {
        throw new Error("User already exists with this email");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await UserRepository.createUser({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        address: address || "",
        emailVerified: false,
        picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`
    });

    const token = jwt.sign(
        {uid: newUser._id.toString(), email: newUser.email, tv: newUser.tokenVersion || 0},
        JWT_SECRET,
        {expiresIn: '30d'}
    );
    return {
        token,
        user: {
            uid: newUser._id.toString(),
            email: newUser.email,
            name: newUser.name,
            picture: newUser.picture,
            address: newUser.address,
            emailVerified: newUser.emailVerified || false,
            gamification: UserRepository.getCorrectedGamification(newUser.gamification)
        }
    };
};

export const loginUser = async (email: string, password: string, req: any) => {
    await connectDB();
    const user = await UserRepository.findUserByEmail(email);
    if (!user || !user.password) {
        throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error("Invalid email or password");
    }

    if (user.twoFactorEnabled) {
        const tempToken = jwt.sign(
            {uid: user._id.toString(), email: user.email, twoFA: true},
            JWT_SECRET,
            {expiresIn: '5m'}
        );
        return {requires2FA: true, tempToken};
    }

    const currentIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const currentDevice = (req.headers['user-agent'] || 'unknown').substring(0, 200);
    const knownIPs: string[] = user.knownIPs || [];
    const knownDevices: string[] = user.knownDevices || [];
    const isNewIP = !knownIPs.includes(currentIP);
    const isNewDevice = !knownDevices.includes(currentDevice);

    if (isNewIP || isNewDevice) {
        if (isNewIP) {
            knownIPs.push(currentIP);
            if (knownIPs.length > 50) knownIPs.shift();
        }
        if (isNewDevice) {
            knownDevices.push(currentDevice);
            if (knownDevices.length > 50) knownDevices.shift();
        }
        await UserRepository.updateUserById(user._id.toString(), {knownIPs, knownDevices});
        sendLoginWarningEmail(user.email, user.name, currentIP, currentDevice).catch((err: Error) => {
            console.error('Login warning email failed:', err);
        });
    }

    const token = jwt.sign(
        {uid: user._id.toString(), email: user.email, tv: user.tokenVersion || 0},
        JWT_SECRET,
        {expiresIn: '30d'}
    );
    return {
        token,
        user: {
            uid: user._id.toString(),
            email: user.email,
            name: user.name,
            picture: user.picture,
            address: user.address || "",
            emailVerified: user.emailVerified || false,
            gamification: UserRepository.getCorrectedGamification(user.gamification)
        }
    };
};

export const createGuestAccount = async () => {
    await connectDB();
    const GUEST_CAP = 500;
    const guestCount = await UserRepository.countGuestUsers();
    if (guestCount >= GUEST_CAP) {
        const pruneCount = Math.ceil(GUEST_CAP * 0.1);
        const oldestGuests = await UserRepository.findOldestGuests(pruneCount);
        if (oldestGuests.length > 0) {
            const ids = oldestGuests.map((g: any) => g._id);
            await Promise.all([
                UserRepository.deleteUsersByIds(ids),
                TaskRepository.deleteTasksByUserIds(ids),
                GoalRepository.deleteGoalsByUserIds(ids),
                ChatRepository.deleteMessagesByUserIds(ids),
                DailyPlanRepository.deletePlansByUserIds(ids),
                FocusSessionRepository.deleteSessionsByUserIds(ids),
            ]);
        }
    }

    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    const guestEmail = `guest-${uniqueSuffix}@taskpilot.ai`;
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    const guest = await UserRepository.createUser({
        email: guestEmail,
        password: hashedPassword,
        name: "Guest Pilot",
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest",
        address: "123 Pilot Way, AI Station",
        isGuest: true
    });
    const token = jwt.sign(
        {uid: guest._id.toString(), email: guest.email, tv: 0},
        JWT_SECRET,
        {expiresIn: '30d'}
    );
    return {
        token,
        user: {
            uid: guest._id.toString(),
            email: guest.email,
            name: guest.name,
            picture: guest.picture,
            address: guest.address || "",
            gamification: UserRepository.getCorrectedGamification(guest.gamification)
        }
    };
};

export const getCurrentUser = async (userId: string) => {
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");

    const now = new Date();
    const isExpired = user.premiumExpiry && user.premiumExpiry < now;
    const isActive = user.isPremium && !isExpired;

    const FREE_TIER_LIMITS: Record<string, number> = {
        '/api/chat': 20, '/api/autonomous-pipeline': 1, '/api/generate-plan': 3,
        '/api/generate-quest-steps': 3, '/api/analyze-task': 5, '/api/generate-subtasks': 5,
        '/api/audio-journal': 2, '/api/docs/generate-report': 1, '/api/presentations/generate': 1,
    };

    let aiUsage: Record<string, { used: number; limit: number }> = {};
    if (!isActive) {
        const today = now.toISOString().split('T')[0];
        const usageRecords = await AIUsageRepository.aggregateUsageByUserAndDate(userId, today);
        for (const [endpoint, limit] of Object.entries(FREE_TIER_LIMITS)) {
            const record = usageRecords.find((r: any) => r._id === endpoint);
            aiUsage[endpoint] = {used: record?.count || 0, limit};
        }
    }

    return {
        uid: user._id.toString(),
        email: user.email,
        name: user.name,
        picture: user.picture,
        address: user.address || "",
        emailVerified: !!user.emailVerified || !!user.googleId || user.authProvider === 'google',
        gamification: UserRepository.getCorrectedGamification(user.gamification) || {
            currentStreak: 0, longestStreak: 0, xp: 0, level: 1,
            totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [],
            unlockedPersonalities: ['default'], activePersonality: 'default'
        },
        isPremium: isActive,
        premiumExpiry: user.premiumExpiry,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionActive: user.subscriptionActive || false,
        role: user.role || 'user',
        aiUsage
    };
};

export const updateProfile = async (userId: string, updates: any) => {
    const {name, address} = updates;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanAddress = typeof address === 'string' ? address.trim() : '';
    if (!cleanName || cleanName.length > 200) {
        throw new Error("Name is required and must be under 200 characters");
    }
    if (cleanAddress.length > 1000) {
        throw new Error("Address must be under 1000 characters");
    }
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");
    const updated = await UserRepository.updateUserById(userId, {name: cleanName, address: cleanAddress});
    return {
        uid: updated._id.toString(),
        email: updated.email,
        name: updated.name,
        picture: updated.picture,
        address: updated.address
    };
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
    if (!currentPassword || !newPassword) {
        throw new Error("Please provide current password and new password");
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
        throw new Error("Password must be 8-128 characters");
    }
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");

    // A Google-linked account can still have a local password if the user set
    // one via the forgot-password flow (account linking) — only block when
    // there's genuinely no password to change yet.
    if (!user.password) {
        throw new Error(
            user.authProvider === 'google'
                ? "This account doesn't have a local password set yet. Use 'Forgot password' to set one."
                : "No local password set for this account"
        );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        throw new Error("Incorrect current password");
    }

    await UserRepository.updateUserById(userId, {
        password: await bcrypt.hash(newPassword, 10),
        tokenVersion: (user.tokenVersion || 0) + 1,
        passwordChangedAt: new Date()
    });
    return {message: "Password updated successfully"};
};

export const forgotPassword = async (email: string) => {
    if (!email) throw new Error("Email is required");
    await connectDB();
    const user = await UserRepository.findOneUser({email: email.toLowerCase()});
    // Note: we intentionally allow this for Google-linked accounts too — it lets
    // a user set/attach a local password to an account that currently only has
    // Google sign-in, so they gain a second login method. We only block on the
    // account simply not existing, so the response message stays uninformative
    // either way (no user-enumeration signal).
    if (!user) {
        return {message: "If an account with that email exists, a reset link has been sent."};
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await UserRepository.updateUserById(user._id.toString(), {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiry: new Date(Date.now() + 15 * 60 * 1000)
    });
    sendPasswordResetEmail(user.email, user.name, rawToken).catch((err: Error) => {
        console.error('Password reset email failed:', err);
    });
    return {message: "If an account with that email exists, a reset link has been sent."};
};

export const validateResetToken = async (token: string) => {
    if (!token) return {valid: false};
    await connectDB();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserRepository.findOneUser({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiry: {$gt: new Date()}
    });
    if (!user) return {valid: false};
    return {valid: true};
};

export const confirmResetPassword = async (token: string, newPassword: string) => {
    if (!token || !newPassword) throw new Error("Token and new password are required");
    if (newPassword.length < 8 || newPassword.length > 128) {
        throw new Error("Password must be 8-128 characters");
    }
    await connectDB();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserRepository.findOneUser({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiry: {$gt: new Date()}
    });
    if (!user) throw new Error("Invalid or expired reset token");
    await UserRepository.updateUserById(user._id.toString(), {
        password: await bcrypt.hash(newPassword, 10),
        passwordResetTokenHash: null,
        passwordResetExpiry: null,
        tokenVersion: (user.tokenVersion || 0) + 1,
        passwordChangedAt: new Date()
    });
    return {message: "Password reset successfully"};
};

export const getTwoFactorStatus = async (userId: string) => {
    await connectDB();
    const user = await UserRepository.findUserByIdSelect(userId, 'twoFactorEnabled emailVerified');
    if (!user) throw new Error("User not found");
    if (!user.emailVerified) throw new Error("Please verify your email address before managing 2FA.");
    return {enabled: !!user.twoFactorEnabled};
};

export const setupTwoFactor = async (userId: string) => {
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");
    if (!user.emailVerified) throw new Error("Please verify your email address before setting up 2FA.");
    if (user.twoFactorEnabled) throw new Error("2FA is already enabled. Disable it first.");
    const {generateTotpSecret, generateQrDataUrl} = await import('../lib/totp.js');
    const {secret, otpauthUrl} = generateTotpSecret(user.email);
    const qrCodeDataUrl = await generateQrDataUrl(otpauthUrl);
    await UserRepository.updateUserById(userId, {twoFactorSecret: encryptToken(secret)});
    return {secret, qrCodeDataUrl};
};

export const verifyTwoFactor = async (userId: string, code: string) => {
    if (!code || code.length !== 6) throw new Error("Please enter a 6-digit code");
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");
    if (!user.twoFactorSecret) throw new Error("No 2FA setup in progress. Start setup first.");
    if (user.twoFactorEnabled) throw new Error("2FA is already enabled.");
    const {verifyTotpCode} = await import('../lib/totp.js');
    const secret = decryptToken(user.twoFactorSecret);
    if (!verifyTotpCode(secret, code)) throw new Error("Invalid code. Please try again.");
    await UserRepository.updateUserById(userId, {twoFactorEnabled: true});
    return {message: "Two-factor authentication enabled successfully"};
};

export const disableTwoFactor = async (userId: string, code: string) => {
    if (!code || code.length !== 6) throw new Error("Please enter a 6-digit code");
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");
    if (!user.emailVerified) throw new Error("Please verify your email address before managing 2FA.");
    if (!user.twoFactorEnabled) throw new Error("2FA is not enabled.");
    const {verifyTotpCode} = await import('../lib/totp.js');
    const secret = decryptToken(user.twoFactorSecret);
    if (!verifyTotpCode(secret, code)) throw new Error("Invalid code.");
    await UserRepository.updateUserById(userId, {twoFactorEnabled: false, twoFactorSecret: null});
    return {message: "Two-factor authentication disabled"};
};

export const validateTwoFactorLogin = async (tempToken: string, code: string) => {
    if (!tempToken || !code) throw new Error("Temp token and code are required");
    let payload: any;
    try {
        payload = jwt.verify(tempToken, JWT_SECRET) as any;
    } catch {
        throw new Error("Invalid or expired session. Please log in again.");
    }
    if (!payload.twoFA || !payload.uid) throw new Error("Invalid temp token");
    await connectDB();
    const user = await UserRepository.findUserById(payload.uid);
    if (!user) throw new Error("User not found");
    if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new Error("2FA is not enabled");
    const {verifyTotpCode} = await import('../lib/totp.js');
    const secret = decryptToken(user.twoFactorSecret);
    if (!verifyTotpCode(secret, code)) throw new Error("Invalid code");
    const newTokenVersion = (user.tokenVersion || 0) + 1;
    await UserRepository.updateUserById(user._id.toString(), {tokenVersion: newTokenVersion});
    const token = jwt.sign(
        {uid: user._id.toString(), email: user.email, tv: newTokenVersion},
        JWT_SECRET,
        {expiresIn: '30d'}
    );
    return {
        token,
        user: {
            uid: user._id.toString(),
            email: user.email,
            name: user.name,
            picture: user.picture,
            address: user.address || "",
            emailVerified: user.emailVerified || false,
            gamification: UserRepository.getCorrectedGamification(user.gamification)
        }
    };
};

// ─── Email Verification ─────────────────────────────────────────────────────

export const sendEmailVerification = async (userId: string) => {
    await connectDB();
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error("User not found");
    if (user.emailVerified) return {message: "Email is already verified"};
    if (user.authProvider === 'google') throw new Error("Google accounts are automatically verified");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await UserRepository.updateUserById(userId, {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    sendVerificationEmail(user.email, user.name, rawToken).catch((err: Error) => {
        console.error('Verification email failed:', err);
    });
    return {message: "Verification email sent"};
};

export const verifyEmail = async (token: string) => {
    if (!token) throw new Error("Token is required");
    await connectDB();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserRepository.findOneUser({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiry: {$gt: new Date()}
    });
    if (!user) throw new Error("Invalid or expired verification link");

    await UserRepository.updateUserById(user._id.toString(), {
        emailVerified: true,
        emailVerificationTokenHash: undefined,
        emailVerificationExpiry: undefined
    });
    return {message: "Email verified successfully"};
};