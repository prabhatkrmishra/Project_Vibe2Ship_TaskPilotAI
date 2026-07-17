import {connectDB} from "../db/mongodb.js";
import {stripMongoMeta, safeError} from "../lib/utils.js";
import {getCorrectedGamification, findUserById} from "../repositories/userRepository.js";
import {findTasksByUser} from "../repositories/taskRepository.js";
import {findGoalsByUserUnsorted} from "../repositories/goalRepository.js";
import {findPlansByUser} from "../repositories/dailyPlanRepository.js";
import {findAllMessagesByUser} from "../repositories/chatRepository.js";
import {findAIDecisionsByUser} from "../repositories/aiDecisionRepository.js";
import {findSessionsByUser} from "../repositories/focusSessionRepository.js";
import * as crypto from "crypto";

const BACKUP_FORMAT_VERSION = 1;

function sanitizeUserProfile(user: any) {
    if (!user) return null;
    const obj = user.toObject ? user.toObject() : {...user};
    delete obj.password;
    delete obj.googleRefreshToken;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpiry;
    delete obj.twoFactorSecret;
    delete obj.knownIPs;
    delete obj.knownDevices;
    delete obj.subscriptions;
    obj.gamification = getCorrectedGamification(obj.gamification);
    obj.id = obj._id?.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
}

export async function exportUserBackup(userId: string) {
    await connectDB();

    const [user, tasks, goals, plans, chats, aiDecisions, focusSessions] = await Promise.all([
        findUserById(userId),
        findTasksByUser(userId),
        findGoalsByUserUnsorted(userId),
        findPlansByUser(userId),
        findAllMessagesByUser(userId),
        findAIDecisionsByUser(userId),
        findSessionsByUser(userId),
    ]);

    const payload = {
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        profile: sanitizeUserProfile(user),
        tasks: tasks.map(stripMongoMeta),
        goals: goals.map(stripMongoMeta),
        dailyPlans: plans.map(stripMongoMeta),
        chats: chats.map(stripMongoMeta),
        aiDecisions: aiDecisions.map(stripMongoMeta),
        focusSessions: focusSessions.map(stripMongoMeta),
    };

    const canonicalJson = JSON.stringify(payload);
    const contentHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

    return {payload, canonicalJson, contentHash};
}
