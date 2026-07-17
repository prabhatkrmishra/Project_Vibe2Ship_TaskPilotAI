import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import {sendValidationError} from "../lib/controllerUtils.js";
import {createFocusSessionSchema} from "../validation/schemas.js";
import {
    createSession,
    findSessionsByUser,
    formatSession,
    getFocusStats
} from "../repositories/focusSessionRepository.js";
import {findUserById, updateUserById} from "../repositories/userRepository.js";

export const createFocusSession = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const userId = (req as any).uid;

        const parsed = createFocusSessionSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }

        const {
            method,
            taskTitle,
            taskId,
            startedAt,
            endedAt,
            plannedDuration,
            actualDuration,
            breaks,
            qualityRating,
            note,
            completed
        } = parsed.data;

        const sessionDoc = await createSession({
            userId, method, taskTitle, taskId, startedAt, endedAt,
            plannedDuration: plannedDuration || 0, actualDuration,
            breaks: breaks || 0, qualityRating, note, completed: completed !== false
        });

        const sessionObj = formatSession(sessionDoc);

        const user = await findUserById(userId);
        if (user) {
            const gamification = user.gamification || {};

            const durationMins = Math.round(actualDuration / 60);
            let xpEarned = 15;
            xpEarned += Math.floor(durationMins / 10);
            if (qualityRating && qualityRating >= 4) xpEarned += 5;
            const methodBonus: Record<string, number> = {
                ultradian: 5,
                '52-17': 3,
                pomodoro: 0,
                flowtime: 2,
                custom: 1
            };
            xpEarned += methodBonus[method] || 0;
            const streakMultiplier = 1 + Math.min((gamification.focusStreak || 0) * 0.1, 0.5);
            xpEarned = Math.round(xpEarned * streakMultiplier);

            const today = new Date().toISOString().slice(0, 10);
            const focusLastActive = gamification.focusLastActiveDate;
            let newFocusStreak = gamification.focusStreak || 0;
            if (focusLastActive) {
                const lastDate = new Date(focusLastActive + "T00:00:00Z");
                const todayDate = new Date(today + "T00:00:00Z");
                const diffDays = Math.floor(Math.abs(todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) newFocusStreak += 1;
                else if (diffDays > 1) newFocusStreak = 1;
            } else {
                newFocusStreak = 1;
            }
            const newLongest = Math.max(gamification.longestFocusStreak || 0, newFocusStreak);

            let xp = (gamification.xp || 0) + xpEarned;
            let level = gamification.level || 1;
            let levelUp = null;
            while (xp >= level * 200) {
                level += 1;
                levelUp = level;
            }

            const incFields: any = {
                'gamification.xp': xpEarned,
                'gamification.totalFocusMinutes': durationMins,
                'gamification.focusSessionsCompleted': 1
            };
            const setFields: any = {
                'gamification.focusStreak': newFocusStreak,
                'gamification.longestFocusStreak': newLongest,
                'gamification.focusLastActiveDate': today,
                'gamification.level': level
            };

            const newBadges: string[] = [];
            const addBadge = (id: string, condition: boolean) => {
                if (condition && !(gamification.earnedBadges || []).includes(id)) {
                    newBadges.push(id);
                }
            };
            addBadge('focus_3', newFocusStreak >= 3);
            addBadge('focus_7', newFocusStreak >= 7);
            addBadge('focus_30', newFocusStreak >= 30);
            addBadge('focus_100', newFocusStreak >= 100);
            addBadge('focus_10_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 10);
            addBadge('focus_50_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 50);
            addBadge('focus_100_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 100);
            addBadge('focus_10_hours', (gamification.totalFocusMinutes || 0) + durationMins >= 600);
            addBadge('focus_100_hours', (gamification.totalFocusMinutes || 0) + durationMins >= 6000);

            const updateOp: any = {$inc: incFields, $set: setFields};
            if (newBadges.length > 0) {
                updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
            }

            await updateUserById(userId, updateOp);

            return res.json({
                session: sessionObj,
                gamification: {xpEarned, newBadges, levelUp, focusStreak: newFocusStreak}
            });
        }

        res.json({session: sessionObj, gamification: null});
    } catch (e: any) {
        console.error("Focus session save error:", e);
        res.status(500).json({error: "Failed to save focus session"});
    }
};

export const getFocusSessionStats = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const userId = (req as any).uid;
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const weekStart = new Date(now);
        const dayOfWeek = now.getDay();
        const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart.setDate(now.getDate() - daysSinceMonday);
        weekStart.setHours(0, 0, 0, 0);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        const matchStage = {userId, startedAt: {$gte: yearAgo}};

        const [aggResult] = await getFocusStats(userId, matchStage, todayStr, weekStart, monthStart);

        const todayData = aggResult.today[0] || {minutes: 0, count: 0};
        const weekData = aggResult.weekTotals[0] || {minutes: 0, count: 0};
        const monthData = aggResult.month[0] || {minutes: 0, count: 0};

        const byMethod: Record<string, number> = {pomodoro: 0, flowtime: 0, '52-17': 0, ultradian: 0, custom: 0};
        for (const m of aggResult.methodBreakdown) {
            if (byMethod.hasOwnProperty(m._id)) byMethod[m._id] = m.total;
            else byMethod[m._id] = m.total;
        }

        const heatmap: Record<string, number> = {};
        for (const h of aggResult.heatmap) heatmap[h.day] = h.total;

        const dailyWeek: Record<string, number> = {};
        for (const d of aggResult.week) dailyWeek[d._id] = d.minutes;

        const user = await findUserById(userId);
        const focusStreak = user?.gamification?.focusStreak || 0;
        const longestFocusStreak = user?.gamification?.longestFocusStreak || 0;
        const totalFocusMinutes = user?.gamification?.totalFocusMinutes || 0;
        const totalFocusSessions = user?.gamification?.focusSessionsCompleted || 0;

        res.json({
            todayMinutes: todayData.minutes, todaySessions: todayData.count,
            weekMinutes: weekData.minutes, weekSessions: weekData.count,
            monthMinutes: monthData.minutes, monthSessions: monthData.count,
            focusStreak, longestFocusStreak,
            totalFocusMinutes, totalFocusSessions,
            byMethod, heatmap, dailyWeek
        });
    } catch (e: any) {
        console.error("Focus stats error:", e);
        res.status(500).json({error: "Failed to fetch focus stats"});
    }
};

export const getFocusSessionHeatmap = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const userId = (req as any).uid;
        const {month} = req.query;
        const now = new Date();
        const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (!/^\d{4}-\d{2}$/.test(targetMonth as string)) {
            return res.status(400).json({error: "Invalid month format. Use YYYY-MM."});
        }

        const [year, mon] = (targetMonth as string).split('-').map(Number);
        if (isNaN(year) || isNaN(mon) || mon < 1 || mon > 12) {
            return res.status(400).json({error: "Invalid month values."});
        }

        const monthStart = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

        const sessions = await findSessionsByUser(userId, {
            startedAt: {$gte: monthStart, $lte: monthEnd}
        });

        const heatmap: Record<string, number> = {};
        for (const s of sessions) {
            const d = new Date(s.startedAt);
            const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            heatmap[day] = (heatmap[day] || 0) + Math.round((s.actualDuration || 0) / 60);
        }

        res.json({month: targetMonth, heatmap});
    } catch (e: any) {
        console.error("Focus heatmap error:", e);
        res.status(500).json({error: "Failed to fetch heatmap"});
    }
};

export const getFocusSessions = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const userId = (req as any).uid;
        const {from, to, method, limit: limitStr} = req.query;
        const filter: any = {userId};
        if (method) filter.method = method;
        if (from || to) {
            filter.startedAt = {};
            if (from) filter.startedAt.$gte = new Date(from as string);
            if (to) filter.startedAt.$lte = new Date(to as string);
        }
        const rawSessions = await findSessionsByUser(userId, filter, parseInt(limitStr as string) || 100);
        const sessions = rawSessions.map((s: any) => formatSession(s));
        res.json({sessions});
    } catch (e: any) {
        console.error("Focus sessions fetch error:", e);
        res.status(500).json({error: "Failed to fetch focus sessions"});
    }
};
