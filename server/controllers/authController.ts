import {Request, Response} from "express";
import {OAuth2Client} from "google-auth-library";
import jwt from "jsonwebtoken";
import {connectDB} from "../db/mongodb.ts";
import {JWT_SECRET} from "../config/env.ts";
import {encryptToken} from "../lib/crypto.ts";
import {sanitizeHtml, safeJsonForScript} from "../lib/sanitize.ts";
import {sendValidationError, sendBadRequest, sendInternalError} from "../lib/controllerUtils.ts";
import {registerSchema, loginSchema, changePasswordSchema, resetPasswordSchema} from "../validation/schemas.ts";
import * as UserRepository from "../repositories/userRepository.ts";
import * as AuthService from "../services/authService.ts";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((o: string) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

const getRequestOrigin = (req: any) => {
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    const finalProto = host.includes(".run.app") ? "https" : proto;
    return `${finalProto}://${host}`;
};

const resolveAllowedOrigin = (req: any): string | null => {
    const origin = getRequestOrigin(req);
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
};

const getRedirectUri = (origin: string) => `${origin}/oauth2callback`;

export const register = async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {email, password, name, address} = parsed.data;
        const result = await AuthService.registerUser(email, password, name, address || '');
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('already exists')) return res.status(400).json({error: msg});
        console.error("Register error:", error);
        sendInternalError(res, error);
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {email, password} = parsed.data;
        const result = await AuthService.loginUser(email, password, req);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('Invalid email or password')) return res.status(400).json({error: msg});
        console.error("Login error:", error);
        sendInternalError(res, error);
    }
};

export const guestLogin = async (req: Request, res: Response) => {
    try {
        const result = await AuthService.createGuestAccount();
        res.json(result);
    } catch (error: any) {
        console.error("Guest error:", error);
        sendInternalError(res, error);
    }
};

export const getMe = async (req: Request, res: Response) => {
    try {
        const result = await AuthService.getCurrentUser(req.uid!);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        console.error("Get me error:", error);
        sendInternalError(res, error);
    }
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const result = await AuthService.updateProfile(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('required') || msg.includes('must be') || msg.includes('under')) {
            return res.status(400).json({error: msg});
        }
        console.error("Update profile error:", error);
        sendInternalError(res, error);
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const parsed = changePasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {currentPassword, newPassword} = parsed.data;
        await AuthService.changePassword(req.uid!, currentPassword, newPassword);
        res.json({message: "Password updated successfully"});
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('Google accounts') || msg.includes('No local password') || msg.includes('Incorrect current password')) {
            return res.status(400).json({error: msg});
        }
        console.error("Change password error:", error);
        sendInternalError(res, error);
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const {email} = req.body;
        if (!email) return res.status(400).json({error: "Email is required"});
        const result = await AuthService.forgotPassword(email);
        res.json(result);
    } catch (error: any) {
        console.error("Forgot password error:", error);
        sendInternalError(res, error);
    }
};

export const validateResetToken = async (req: Request, res: Response) => {
    try {
        const {token} = req.params;
        if (!token) return res.status(400).json({valid: false});
        const result = await AuthService.validateResetToken(token);
        res.json(result);
    } catch (error: any) {
        res.json({valid: false});
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const parsed = resetPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {token, newPassword} = parsed.data;
        const result = await AuthService.confirmResetPassword(token, newPassword);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('Invalid or expired reset token')) {
            return res.status(400).json({error: msg});
        }
        console.error("Reset password error:", error);
        sendInternalError(res, error);
    }
};

export const getTwoFactorStatus = async (req: Request, res: Response) => {
    try {
        const result = await AuthService.getTwoFactorStatus(req.uid!);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('verify your email')) return res.status(403).json({error: msg});
        console.error("2FA status error:", error);
        sendInternalError(res, error);
    }
};

export const setupTwoFactor = async (req: Request, res: Response) => {
    try {
        const result = await AuthService.setupTwoFactor(req.uid!);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('verify your email')) return res.status(403).json({error: msg});
        if (msg.includes('already enabled') || msg.includes('Disable it first')) {
            return res.status(400).json({error: msg});
        }
        console.error("2FA setup error:", error);
        sendInternalError(res, error);
    }
};

export const verifyTwoFactor = async (req: Request, res: Response) => {
    try {
        const {code} = req.body;
        const result = await AuthService.verifyTwoFactor(req.uid!, code);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('Invalid code') || msg.includes('already enabled') || msg.includes('No 2FA setup') || msg.includes('6-digit')) {
            return res.status(400).json({error: msg});
        }
        console.error("2FA verify error:", error);
        sendInternalError(res, error);
    }
};

export const disableTwoFactor = async (req: Request, res: Response) => {
    try {
        const {code} = req.body;
        const result = await AuthService.disableTwoFactor(req.uid!, code);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('verify your email')) return res.status(403).json({error: msg});
        if (msg.includes('Invalid code') || msg.includes('not enabled') || msg.includes('6-digit')) {
            return res.status(400).json({error: msg});
        }
        console.error("2FA disable error:", error);
        sendInternalError(res, error);
    }
};

export const validateTwoFactorLogin = async (req: Request, res: Response) => {
    try {
        const {tempToken, code} = req.body;
        const result = await AuthService.validateTwoFactorLogin(tempToken, code);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('User not found')) return res.status(404).json({error: msg});
        if (msg.includes('Invalid') || msg.includes('expired') || msg.includes('not enabled') || msg.includes('6-digit')) {
            return res.status(400).json({error: msg});
        }
        console.error("2FA validate-login error:", error);
        sendInternalError(res, error);
    }
};

export const sendVerification = async (req: any, res: Response) => {
    try {
        const result = await AuthService.sendEmailVerification(req.uid);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('already verified') || msg.includes('Google accounts')) return res.status(400).json({error: msg});
        sendInternalError(res, error);
    }
};

export const verifyEmailToken = async (req: Request, res: Response) => {
    try {
        const {token} = req.query;
        if (!token || typeof token !== 'string') return res.status(400).json({error: "Token is required"});
        const result = await AuthService.verifyEmail(token);
        res.json(result);
    } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('Invalid') || msg.includes('expired') || msg.includes('required')) return res.status(400).json({error: msg});
        sendInternalError(res, error);
    }
};

const PERSONALITY_COSTS: Record<string, number> = {
    default: 0,
    drill_sergeant: 500,
    zen_guide: 1000,
    executive: 2000,
};

export const unlockPersonality = async (req: Request, res: Response) => {
    try {
        const {personalityId} = req.body;
        const cost = PERSONALITY_COSTS[personalityId];
        if (cost === undefined) {
            return res.status(400).json({error: "Unknown personality"});
        }
        await connectDB();
        const result = await UserRepository.updateUserConditions(
            {
                _id: req.uid,
                'gamification.xp': {$gte: cost},
                'gamification.unlockedPersonalities': {$ne: personalityId}
            },
            {
                $inc: {'gamification.xp': -cost},
                $addToSet: {'gamification.unlockedPersonalities': personalityId},
                $set: {'gamification.activePersonality': personalityId}
            },
            {returnDocument: 'after'}
        );
        if (!result) {
            const user = await UserRepository.findUserByIdSelect(req.uid, 'gamification');
            if (!user) return res.status(404).json({error: "User not found"});
            if ((user.gamification?.xp || 0) < cost) return res.status(400).json({error: "Not enough XP"});
            if ((user.gamification?.unlockedPersonalities || []).includes(personalityId)) {
                return res.status(400).json({error: "Already unlocked"});
            }
            return res.status(500).json({error: "Failed to unlock personality"});
        }
        res.json({gamification: (result as any).gamification});
    } catch (err: any) {
        sendInternalError(res, err);
    }
};

export const setActivePersonality = async (req: Request, res: Response) => {
    try {
        const {personalityId} = req.body;
        await connectDB();
        const user = await UserRepository.findUserById(req.uid);
        if (!user) return res.status(404).json({error: "User not found"});
        if (!user.gamification || !user.gamification.unlockedPersonalities?.includes(personalityId)) {
            return res.status(400).json({error: "Personality not unlocked"});
        }
        user.gamification.activePersonality = personalityId;
        user.markModified('gamification');
        await user.save();
        res.json({gamification: user.gamification});
    } catch (err: any) {
        sendInternalError(res, err);
    }
};

async function findOrCreateGoogleUser(googleUid: string, email: string, name: string, picture: string, tokens: any, currentUserId: string | null) {
    await connectDB();

    const existingLinkedUser = await UserRepository.findUserByGoogleIdOrEmail(googleUid, email.toLowerCase());

    let user: any;

    if (currentUserId) {
        const currentUser = await UserRepository.findUserById(currentUserId);
        if (!currentUser) throw new Error("Current user session not found");

        if (existingLinkedUser) {
            if (existingLinkedUser._id.toString() !== currentUserId) {
                throw new Error("google email already connected to other email, sign in with google or with other email");
            }
            user = existingLinkedUser;
        } else {
            currentUser.googleId = googleUid;
            currentUser.googleEmail = email.toLowerCase();
            if (tokens.refresh_token) {
                currentUser.googleRefreshToken = encryptToken(tokens.refresh_token);
            }
            if (picture && !currentUser.picture) currentUser.picture = picture;
            await currentUser.save();
            user = currentUser;
        }
    } else {
        if (existingLinkedUser) {
            user = existingLinkedUser;
            if (tokens.refresh_token) {
                user.googleRefreshToken = encryptToken(tokens.refresh_token);
            }
            if (picture && !user.picture) user.picture = picture;
            await user.save();
        } else {
            user = await UserRepository.findUserByEmail(email.toLowerCase());
            if (!user) {
                user = await UserRepository.createUser({
                    email: email.toLowerCase(),
                    name: name || email,
                    picture,
                    authProvider: "google",
                    emailVerified: true,
                    googleId: googleUid,
                    googleEmail: email.toLowerCase(),
                    googleRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined,
                });
            } else {
                user.authProvider = "google";
                user.emailVerified = true;
                user.googleId = googleUid;
                user.googleEmail = email.toLowerCase();
                if (picture && !user.picture) user.picture = picture;
                if (tokens.refresh_token) user.googleRefreshToken = encryptToken(tokens.refresh_token);
                await user.save();
            }
        }
    }

    return user;
}

function buildGoogleUserResponse(user: any) {
    return {
        email: user.email,
        name: user.name,
        picture: user.picture,
        uid: user._id.toString(),
        emailVerified: !!user.emailVerified || !!user.googleId || user.authProvider === 'google',
        gamification: UserRepository.getCorrectedGamification(user.gamification),
        isPremium: user.isPremium || false,
        premiumExpiry: user.premiumExpiry || null,
        subscriptionPlan: user.subscriptionPlan || null,
        role: user.role || "user",
    };
}

export const googleCallback = async (req: Request, res: Response) => {
    const {code} = req.body;
    if (!code) return res.status(400).send("Code is missing");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).send("Google OAuth credentials are not fully configured in .env");
    }

    const oauth2Client = new OAuth2Client({clientId, clientSecret, redirectUri: "postmessage"});

    try {
        const {tokens} = await oauth2Client.getToken(code);
        const accessToken = tokens.access_token;
        oauth2Client.setCredentials(tokens);

        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {Authorization: `Bearer ${accessToken}`},
        });
        if (!userRes.ok) return res.status(500).send("Failed to fetch user profile from Google");

        const userInfo = await userRes.json();
        const {sub: googleUid, email, name: rawName, picture} = userInfo;
        const name = sanitizeHtml(rawName);
        if (!email) return res.status(400).send("Google account has no email address to sign in with.");

        let currentUserId: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split("Bearer ")[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                currentUserId = decoded.uid;
            } catch {
            }
        }

        const user = await findOrCreateGoogleUser(googleUid, email, name, picture, tokens, currentUserId);

        const taskpilotToken = jwt.sign({
            uid: user._id.toString(),
            email: user.email,
            tv: user.tokenVersion || 0,
        }, JWT_SECRET, {expiresIn: "30d"});

        res.json({
            accessToken,
            taskpilotToken,
            user: buildGoogleUserResponse(user),
        });
    } catch (err: any) {
        console.error("Google OAuth error:", err);
        sendInternalError(res, err);
    }
};

export const generateGoogleAuthUrl = async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).json({error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured in .env"});
    }

    const origin = resolveAllowedOrigin(req);
    if (!origin) {
        return res.status(400).json({
            error: `This domain (${getRequestOrigin(req)}) is not in ALLOWED_ORIGINS.`,
        });
    }

    const oauth2Client = new OAuth2Client({clientId, clientSecret, redirectUri: getRedirectUri(origin)});

    const scopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/presentations",
        "https://www.googleapis.com/auth/tasks.readonly",
    ];

    let currentUserId: string | null = null;
    const authHeader = req.headers.authorization || req.query.token;
    if (authHeader) {
        const token = (authHeader as string).replace("Bearer ", "");
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            currentUserId = decoded.uid;
        } catch {
        }
    }

    const state = jwt.sign({purpose: "oauth_state", origin, currentUserId}, JWT_SECRET, {expiresIn: "10m"});

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        include_granted_scopes: true,
        prompt: "consent",
        state,
    });

    res.json({url: authUrl});
};

export const oauthCallback = async (req: Request, res: Response) => {
    const {code, state, error: oauthError} = req.query;

    if (oauthError) {
        return res.status(400).send(`Google sign-in was cancelled or failed: ${oauthError}`);
    }
    if (!code) {
        return res.status(400).send("Authorization code is missing");
    }

    let origin: string;
    let currentUserId: string | null = null;
    try {
        const decoded = jwt.verify(state as string, JWT_SECRET) as any;
        if (decoded.purpose !== "oauth_state" || !decoded.origin) throw new Error("bad state payload");
        origin = decoded.origin;
        currentUserId = decoded.currentUserId || null;
        if (!ALLOWED_ORIGINS.includes(origin)) throw new Error("origin no longer allowed");
    } catch {
        return res.status(401).send("Invalid or expired authentication request. Please try signing in again.");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).send("Google OAuth credentials are not fully configured in .env");
    }

    const oauth2Client = new OAuth2Client({clientId, clientSecret, redirectUri: getRedirectUri(origin)});

    try {
        const {tokens} = await oauth2Client.getToken(code as string);
        const accessToken = tokens.access_token;
        oauth2Client.setCredentials(tokens);

        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {Authorization: `Bearer ${accessToken}`},
        });
        if (!userRes.ok) {
            return res.status(500).send("Failed to fetch user profile from Google");
        }

        const userInfo = await userRes.json();
        const {sub: googleUid, email, name: rawName, picture} = userInfo;
        const name = sanitizeHtml(rawName);
        if (!email) {
            return res.status(400).send("Google account has no email address to sign in with.");
        }

        const user = await findOrCreateGoogleUser(googleUid, email, name, picture, tokens, currentUserId);

        const taskpilotToken = jwt.sign({
            uid: user._id.toString(),
            email: user.email,
            tv: user.tokenVersion || 0,
        }, JWT_SECRET, {expiresIn: "30d"});

        const targetOrigin = origin;
        res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .spinner { border: 4px solid rgba(255, 255, 255, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #58a6ff; animation: spin 1s linear infinite; margin-bottom: 20px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h3>Authentication successful!</h3>
          <p>Closing window and returning to app...</p>
          <script>
            const authData = {
              type: 'GOOGLE_AUTH_SUCCESS',
              accessToken: ${safeJsonForScript(accessToken)},
              taskpilotToken: ${safeJsonForScript(taskpilotToken)},
              user: ${safeJsonForScript(buildGoogleUserResponse(user))}
            };
            if (window.opener) {
              window.opener.postMessage(authData, ${safeJsonForScript(targetOrigin)});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
    } catch (err: any) {
        console.error("Google OAuth error:", err);
        sendInternalError(res, err);
    }
};
