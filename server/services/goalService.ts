import * as GoalRepository from "../repositories/goalRepository.js";
import {processGamificationOnGoalComplete, syncQuestProgress} from "../lib/gamification.js";
import {getSchedulingMode} from "../lib/scheduling.js";
import * as TaskRepository from "../repositories/taskRepository.js";

// ─── Goal Service ─────────────────────────────────────────────────────────────
// This file contains business logic for goals, including creation, updating,
// completion handling, and integration with gamification and scheduling systems.

/**
 * Creates a new goal with validation
 * @param goalData - Data for the new goal
 * @param userId - The user ID
 * @returns The created goal
 */
export const createGoal = async (goalData: any, userId: string) => {
    const data: any = {userId};
    if (goalData.title != null) data.title = goalData.title;
    if (goalData.description != null) data.description = goalData.description;
    if (goalData.type != null) data.type = goalData.type;
    if (goalData.targetDate != null) data.targetDate = goalData.targetDate;
    if (goalData.targetValue != null) data.targetValue = goalData.targetValue;
    if (goalData.unit != null) data.unit = goalData.unit;
    if (goalData.subtasks != null) data.subtasks = goalData.subtasks;

    const newGoal = await GoalRepository.createGoal(data);
    return GoalRepository.formatGoal(newGoal);
};

/**
 * Gets goals for a specific user
 * @param userId - The user ID
 * @returns Array of goals for the user
 */
export const getGoalsByUser = async (userId: string) => {
    const goals = await GoalRepository.findGoalsByUser(userId);
    return goals.map(GoalRepository.formatGoal);
};

/**
 * Gets a specific goal by ID scoped to a user
 * @param id - The goal ID
 * @param userId - The user ID
 * @returns The goal document or null
 */
export const getGoalById = async (id: string, userId: string) => {
    const goal = await GoalRepository.findGoalByIdForUser(id, userId);
    return goal ? GoalRepository.formatGoal(goal) : null;
};

/**
 * Updates a goal with validation and handles cascading task deletion
 * @param id - The goal ID
 * @param userId - The user ID
 * @param updateData - Update data
 * @returns The updated goal or null
 */
export const updateGoal = async (id: string, userId: string, updateData: any) => {
    const data: any = {};
    if (updateData.title != null) data.title = updateData.title;
    if (updateData.description != null) data.description = updateData.description;
    if (updateData.type != null) data.type = updateData.type;
    if (updateData.targetDate != null) data.targetDate = updateData.targetDate;
    if (updateData.targetValue != null) data.targetValue = updateData.targetValue;
    if (updateData.unit != null) data.unit = updateData.unit;
    if (updateData.subtasks != null) data.subtasks = updateData.subtasks;
    if (updateData.completed === true) {
        data.status = 'archived';
        data.completedAt = new Date().toISOString();
    } else if (updateData.completed === false) {
        data.status = 'active';
        data.completedAt = null;
    }

    const updatedGoal = await GoalRepository.updateGoalById(id, userId, data);
    return updatedGoal ? GoalRepository.formatGoal(updatedGoal) : null;
};

/**
 * Deletes a goal and all linked tasks
 * @param id - The goal ID
 * @param userId - The user ID
 * @returns The deleted goal or null
 */
export const deleteGoal = async (id: string, userId: string) => {
    const deletedGoal = await GoalRepository.deleteGoalById(id, userId);
    if (deletedGoal) {
        // Delete all linked tasks as well
        await TaskRepository.deleteTasksByGoalAndUser(id, userId);
    }
    return deletedGoal ? GoalRepository.formatGoal(deletedGoal) : null;
};

/**
 * Completes a goal (archives it) and processes associated logic
 * @param goalId - The goal ID
 * @param userId - The user ID
 * @returns The completed goal
 */
export const completeGoal = async (goalId: string, userId: string) => {
    const goal = await GoalRepository.findGoalByIdForUser(goalId, userId);
    if (!goal) {
        throw new Error("Goal not found");
    }

    // Update goal status to archived (completed)
    const updatedGoal = await GoalRepository.updateGoalById(goalId, userId, {
        status: 'archived',
        completedAt: new Date()
    });

    // Process gamification
    await processGamificationOnGoalComplete(userId, goal);

    // Sync quest progress if applicable
    if (goal.projectId) {
        await syncQuestProgress(userId, goal.projectId);
    }

    return updatedGoal ? GoalRepository.formatGoal(updatedGoal) : null;
};

/**
 * Gets the scheduling mode for a goal
 * @param goal - The goal object
 * @returns The scheduling mode
 */
export const getSchedulingModeForGoal = async (goal: any) => {
    return await getSchedulingMode(goal);
};

/**
 * Gets goal statistics for a user
 * @param userId - The user ID
 * @returns Goal statistics
 */
export const getGoalStats = async (userId: string) => {
    const total = await GoalRepository.countGoalsByUser(userId);
    const active = await GoalRepository.countActiveGoalsByUser(userId);
    const archived = total - active;

    return {
        total,
        active,
        archived,
        completionRate: total > 0 ? Math.round((active / total) * 100) : 0
    };
};

/**
 * Gets active goals for a user
 * @param userId - The user ID
 * @returns Array of active goals
 */
export const getActiveGoals = async (userId: string) => {
    const goals = await GoalRepository.findActiveGoalsByUser(userId);
    return goals.map(GoalRepository.formatGoal);
};

/**
 * Gets archived goals for a user
 * @param userId - The user ID
 * @returns Array of archived goals
 */
export const getArchivedGoals = async (userId: string) => {
    const goals = await GoalRepository.findArchivedGoalsByUser(userId);
    return goals.map(GoalRepository.formatGoal);
};

/**
 * Gets goals due today for a user
 * @param userId - The user ID
 * @returns Array of goals due today
 */
export const getDueTodayGoals = async (userId: string) => {
    const goals = await GoalRepository.findDueTodayGoalsByUser(userId);
    return goals.map(GoalRepository.formatGoal);
};