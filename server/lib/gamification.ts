import {connectDB, User, Task, Goal} from "../db/mongodb";

function localDateStr(d?: Date): string {
    const date = d || new Date();
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

export async function awardQuestCompletionXP(userId: string) {
    try {
        const questUser = await User.findOne({_id: userId});
        if (!questUser) return;
        const g = questUser.gamification || {
            currentStreak: 0, longestStreak: 0, lastActiveDate: null,
            xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
        };
        g.xp += 100;
        while (g.xp >= g.level * 200) {
            g.level += 1;
        }
        if (!g.earnedBadges) g.earnedBadges = [];
        questUser.gamification = g;
        questUser.markModified('gamification');
        await questUser.save();
    } catch { /* non-critical */
    }
}

export async function processGamificationOnTaskComplete(userId: string, task: any) {
    try {
        const user = await User.findOne({_id: userId});
        if (!user) return null;

        let gamification = user.gamification || {
            currentStreak: 0, longestStreak: 0, lastActiveDate: null,
            xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
        };

        const today = localDateStr();

        let newStreak = gamification.currentStreak;
        if (gamification.lastActiveDate !== today) {
            if (gamification.lastActiveDate) {
                const lastActive = new Date(gamification.lastActiveDate);
                const todayDate = new Date(today);
                const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                newStreak = diffDays === 1 ? gamification.currentStreak + 1 : 1;
            } else {
                newStreak = 1;
            }
        }
        const newLongest = Math.max(gamification.longestStreak, newStreak);

        const isOnTime = !task.deadline || new Date(task.deadline) >= new Date();
        const xpEarned = isOnTime ? 50 : 25;

        const newTotal = gamification.totalTasksCompleted + 1;
        const newOnTime = gamification.onTimeTasksCompleted + (isOnTime ? 1 : 0);
        const newXP = gamification.xp + xpEarned;

        let level = gamification.level;
        let levelUp = null;
        let tmpXP = newXP;
        while (tmpXP >= level * 200) {
            level += 1;
            levelUp = level;
        }

        const newBadges: string[] = [];
        const addBadge = (id: string, condition: boolean) => {
            if (condition && !gamification.earnedBadges.includes(id)) {
                newBadges.push(id);
            }
        };
        addBadge('streak_3', newStreak >= 3);
        addBadge('streak_7', newStreak >= 7);
        addBadge('streak_30', newStreak >= 30);
        addBadge('streak_100', newStreak >= 100);
        addBadge('tasks_50', newTotal >= 50);
        addBadge('tasks_500', newTotal >= 500);
        addBadge('punctual_10', newOnTime >= 10);
        addBadge('deadline_50', newOnTime >= 50);

        const updateOp: any = {
            $inc: {
                'gamification.xp': xpEarned,
                'gamification.totalTasksCompleted': 1,
                ...(isOnTime ? {'gamification.onTimeTasksCompleted': 1} : {})
            },
            $set: {
                'gamification.currentStreak': newStreak,
                'gamification.longestStreak': newLongest,
                'gamification.lastActiveDate': today,
                'gamification.level': level
            }
        };
        if (newBadges.length > 0) {
            updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
        }

        const updateResult = await User.findOneAndUpdate(
            {_id: userId, 'gamification.lastActiveDate': gamification.lastActiveDate},
            updateOp,
            {returnDocument: 'after'}
        );

        if (!updateResult) {
            console.warn("Gamification update skipped due to concurrent modification");
            return null;
        }

        return {xpEarned, newBadges, levelUp};
    } catch (e) {
        console.error("Gamification error:", e);
        return null;
    }
}

export async function processGamificationOnGoalComplete(userId: string, goal: any) {
    return null;
}

export async function processGamificationOnSessionComplete(userId: string) {
    try {
        const user = await User.findOne({_id: userId});
        if (!user) return null;
        let gamification = user.gamification || {
            currentStreak: 0, longestStreak: 0, lastActiveDate: null,
            xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
        };
        const today = localDateStr();

        let newStreak = gamification.currentStreak;
        if (gamification.lastActiveDate !== today) {
            if (gamification.lastActiveDate) {
                const lastActive = new Date(gamification.lastActiveDate);
                const todayDate = new Date(today);
                const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                newStreak = diffDays === 1 ? gamification.currentStreak + 1 : 1;
            } else {
                newStreak = 1;
            }
        }
        const newLongest = Math.max(gamification.longestStreak, newStreak);

        const xpEarned = 10;
        const newXP = gamification.xp + xpEarned;
        let level = gamification.level;
        let levelUp = null;
        let tmpXP = newXP;
        while (tmpXP >= level * 200) {
            level += 1;
            levelUp = level;
        }

        const newBadges: string[] = [];
        const addBadge = (id: string, condition: boolean) => {
            if (condition && !gamification.earnedBadges.includes(id)) {
                newBadges.push(id);
            }
        };
        addBadge('streak_3', newStreak >= 3);
        addBadge('streak_7', newStreak >= 7);
        addBadge('streak_30', newStreak >= 30);
        addBadge('streak_100', newStreak >= 100);

        const updateOp: any = {
            $inc: {'gamification.xp': xpEarned},
            $set: {
                'gamification.currentStreak': newStreak,
                'gamification.longestStreak': newLongest,
                'gamification.lastActiveDate': today,
                'gamification.level': level
            }
        };
        if (newBadges.length > 0) {
            updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
        }

        const updateResult = await User.findOneAndUpdate(
            {_id: userId, 'gamification.lastActiveDate': gamification.lastActiveDate},
            updateOp,
            {returnDocument: 'after'}
        );
        if (!updateResult) {
            console.warn("Session gamification skipped due to concurrent modification");
            return null;
        }
        return {xpEarned, newBadges, levelUp};
    } catch (e) {
        console.error("Session gamification error:", e);
        return null;
    }
}

export async function syncQuestProgress(userId: string, goalId: string) {
    try {
        await connectDB();
        const tasks = await Task.find({userId, goalId});
        if (tasks.length === 0) return null;
        const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
        const progress = Math.round((completedCount / tasks.length) * 100);
        const isCompleted = progress === 100;
        const goal = await Goal.findOne({_id: goalId, userId});
        if (!goal) return null;
        if (goal.progress === progress && goal.completed === isCompleted) return {progress, completed: isCompleted};
        const updateData: any = {progress};
        if (isCompleted && !goal.completed) {
            updateData.completed = true;
            updateData.completedAt = goal.completedAt || new Date().toISOString();
        } else if (!isCompleted) {
            updateData.completed = false;
            updateData.completedAt = null;
        }
        await Goal.findOneAndUpdate({_id: goalId, userId}, {$set: updateData});
        return {progress, completed: isCompleted};
    } catch (e) {
        console.error("syncQuestProgress error:", e);
        return null;
    }
}
