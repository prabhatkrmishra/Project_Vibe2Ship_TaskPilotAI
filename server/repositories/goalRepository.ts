import {Goal} from "../db/mongodb.ts";

// ─── Goal Repository ──────────────────────────────────────────────────────────
// This file contains data access methods for Goal entities.
// Implements CRUD operations and queries specific to goals.

/**
 * Finds a goal by its ID
 * @param id - The goal ID
 * @returns The goal document or null if not found
 */
export const findGoalById = (id: string) => Goal.findById(id);

/**
 * Finds a goal by its ID scoped to a user
 * @param id - The goal ID
 * @param userId - The user ID to scope the query to
 * @returns The goal document or null if not found
 */
export const findGoalByIdForUser = (id: string, userId: string) =>
    Goal.findOne({_id: id, userId});

/**
 * Finds goals by user ID sorted by createdAt descending
 * @param userId - The user ID
 * @returns Array of goal documents
 */
export const findGoalsByUser = (userId: string) => Goal.find({userId}).sort({createdAt: -1});

/**
 * Finds goals by team ID
 * @param teamId - The team ID
 * @returns Array of goal documents
 */
export const findGoalsByTeam = (teamId: string) => Goal.find({teamId});

/**
 * Creates a new goal
 * @param data - Goal data to create
 * @returns The created goal document
 */
export const createGoal = (data: Partial<any>) => Goal.create(data);

/**
 * Updates a goal by ID
 * @param id - The goal ID
 * @param userId - The user ID
 * @param update - Update data
 * @returns The updated goal document or null if not found
 */
export const updateGoalById = (id: string, userId: string, update: Partial<any>) =>
    Goal.findOneAndUpdate({_id: id, userId}, update, {returnDocument: 'after'});

/**
 * Deletes a goal by ID
 * @param id - The goal ID
 * @param userId - The user ID
 * @returns The deleted goal document or null if not found
 */
export const deleteGoalById = (id: string, userId: string) =>
    Goal.findOneAndDelete({_id: id, userId});

/**
 * Finds active goals by user ID
 * @param userId - The user ID
 * @returns Array of active goal documents
 */
export const findActiveGoalsByUser = (userId: string) =>
    Goal.find({userId, status: {$ne: 'archived'}});

/**
 * Finds archived goals by user ID
 * @param userId - The user ID
 * @returns Array of archived goal documents
 */
export const findArchivedGoalsByUser = (userId: string) =>
    Goal.find({userId, status: 'archived'});

/**
 * Finds goals due today by user ID
 * @param userId - The user ID
 * @returns Array of goals due today
 */
export const findDueTodayGoalsByUser = (userId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return Goal.find({
        userId,
        deadline: {$gte: today, $lt: tomorrow},
        status: {$ne: 'archived'}
    });
};

/**
 * Counts total goals for a user
 * @param userId - The user ID
 * @returns Count of goals
 */
export const countGoalsByUser = (userId: string) =>
    Goal.countDocuments({userId});

/**
 * Counts active goals for a user
 * @param userId - The user ID
 * @returns Count of active goals
 */
export const countActiveGoalsByUser = (userId: string) =>
    Goal.countDocuments({userId, status: {$ne: 'archived'}});

export const deleteGoalsByUserIds = (userIds: string[]) =>
    Goal.deleteMany({userId: {$in: userIds}});

export const findGoalsByUserUnsorted = (userId: string) =>
    Goal.find({userId});

/**
 * Formats a goal document for API response (applies streak correction)
 * @param goal - The goal document
 * @returns Formatted goal object
 */
export const formatGoal = (goal: any) => {
    if (!goal) return goal;
    const obj = goal.toObject ? goal.toObject() : {...goal};
    // Apply streak correction (same logic as getCorrectedGoal in server.ts)
    if (obj.type === 'habit' && obj.lastLogged) {
        const today = localDateStr();
        if (obj.lastLogged !== today) {
            const lastActive = new Date(obj.lastLogged);
            const todayDate = new Date(today);
            const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 1) {
                obj.streak = 0;
            }
        }
    }
    // Time-based habit: auto-break streak if past scheduled time +5 min and not logged today
    if (obj.type === 'habit' && obj.scheduledTime && obj.lastLogged) {
        const today = localDateStr();
        if (obj.lastLogged !== today) {
            const [schedH, schedM] = obj.scheduledTime.split(':').map(Number);
            const now = new Date();
            const scheduledMinutes = schedH * 60 + schedM;
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            if (currentMinutes > scheduledMinutes + 5) {
                obj.streak = 0;
            }
        }
    }
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
};

// Helper function for local date string (same as in server.ts)
function localDateStr(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}