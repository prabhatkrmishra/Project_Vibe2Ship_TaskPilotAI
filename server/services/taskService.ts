import * as TaskRepository from "../repositories/taskRepository.js";
import {processGamificationOnTaskComplete, syncQuestProgress, awardQuestCompletionXP} from "../lib/gamification.js";
import {getSchedulingMode} from "../lib/scheduling.js";


// ─── Task Service ─────────────────────────────────────────────────────────────
// This file contains business logic for tasks, including creation, updating,
// completion handling, and integration with gamification and scheduling systems.

/**
 * Creates a new task with validation
 * @param taskData - Data for the new task
 * @param userId - The user ID
 * @returns The created task
 */
export const createTask = async (taskData: any, userId: string) => {
    const data: any = {userId};
    if (taskData.title != null) data.title = taskData.title;
    if (taskData.description != null) data.description = taskData.description;
    if (taskData.priority != null) data.priority = taskData.priority;
    if (taskData.status != null) data.status = taskData.status;
    if (taskData.deadline != null) data.deadline = taskData.deadline;
    if (taskData.estimatedHours != null) data.estimatedHours = taskData.estimatedHours;
    if (taskData.goalId != null) data.goalId = taskData.goalId;
    if (taskData.subtasks != null) data.subtasks = taskData.subtasks;
    if (taskData.schedulingPreference != null) data.schedulingPreference = taskData.schedulingPreference;

    const newTask = await TaskRepository.createTask(data);
    return TaskRepository.formatTask(newTask);
};

/**
 * Gets tasks for a specific user
 * @param userId - The user ID
 * @returns Array of tasks for the user
 */
export const getTasksByUser = async (userId: string) => {
    const tasks = await TaskRepository.findTasksByUser(userId);
    return tasks.map(TaskRepository.formatTask);
};

/**
 * Gets a specific task by ID scoped to a user
 * @param id - The task ID
 * @param userId - The user ID
 * @returns The task document or null
 */
export const getTaskById = async (id: string, userId: string) => {
    const task = await TaskRepository.findTaskByIdForUser(id, userId);
    return task ? TaskRepository.formatTask(task) : null;
};

/**
 * Updates a task with validation and gamification/quest sync
 * @param id - The task ID
 * @param userId - The user ID
 * @param updateData - Update data
 * @returns The updated task with gamification/quest sync info
 */
export const updateTask = async (id: string, userId: string, updateData: any) => {
    const existingTask = await TaskRepository.findTaskByIdForUser(id, userId);
    if (!existingTask) return null;

    const isNowCompleted = updateData.status === 'completed';
    const shouldAwardGamification = isNowCompleted && !existingTask.hasBeenCompleted;

    const data: any = {};
    if (updateData.title != null) data.title = updateData.title;
    if (updateData.description != null) data.description = updateData.description;
    if (updateData.priority != null) data.priority = updateData.priority;
    if (updateData.status != null) data.status = updateData.status;
    if (updateData.deadline != null) data.deadline = updateData.deadline;
    if (updateData.estimatedHours != null) data.estimatedHours = updateData.estimatedHours;
    if (updateData.goalId !== undefined) data.goalId = updateData.goalId;
    if (updateData.subtasks != null) data.subtasks = updateData.subtasks;
    if (updateData.schedulingPreference != null) data.schedulingPreference = updateData.schedulingPreference;
    if (updateData.hasBeenCompleted != null) data.hasBeenCompleted = Boolean(updateData.hasBeenCompleted);

    if (shouldAwardGamification) {
        data.hasBeenCompleted = true;
    }
    if (isNowCompleted) {
        data.completedAt = existingTask.completedAt || new Date().toISOString();
    } else if (updateData.status && updateData.status !== 'completed') {
        data.completedAt = null;
        data.hasBeenCompleted = false;
        if (existingTask.subtasks && existingTask.subtasks.length > 0) {
            data.subtasks = existingTask.subtasks.map((st: any) => ({...st, completed: false}));
        }
    }

    const updatedTask = await TaskRepository.updateTaskById(id, userId, data);
    if (!updatedTask) return null;

    const formattedTask = TaskRepository.formatTask(updatedTask);

    let gamificationUpdates = null;
    if (shouldAwardGamification) {
        gamificationUpdates = await processGamificationOnTaskComplete(userId, updatedTask);
    }

    let questSync = null;
    if (existingTask.goalId) {
        questSync = await syncQuestProgress(userId, existingTask.goalId);
        if (questSync?.completed) {
            await awardQuestCompletionXP(userId);
        }
    }

    return {...formattedTask, gamificationUpdates, questSync};
};

/**
 * Deletes a task
 * @param id - The task ID
 * @param userId - The user ID
 * @returns The deleted task or null
 */
export const deleteTask = async (id: string, userId: string) => {
    const deletedTask = await TaskRepository.deleteTaskById(id, userId);
    return deletedTask ? TaskRepository.formatTask(deletedTask) : null;
};

/**
 * Completes a task and processes associated logic
 * @param taskId - The task ID
 * @param userId - The user ID
 * @returns The completed task
 */
export const completeTask = async (taskId: string, userId: string) => {
    const task = await TaskRepository.findTaskByIdForUser(taskId, userId);
    if (!task) {
        throw new Error("Task not found");
    }

    const updatedTask = await TaskRepository.updateTaskById(taskId, userId, {
        status: 'completed',
        completedAt: new Date()
    });

    await processGamificationOnTaskComplete(userId, task);

    if (task.goalId) {
        await syncQuestProgress(userId, task.goalId);
    }

    return updatedTask ? TaskRepository.formatTask(updatedTask) : null;
};

/**
 * Gets the scheduling mode for a task
 * @param task - The task object
 * @returns The scheduling mode
 */
export const getSchedulingModeForTask = async (task: any) => {
    return await getSchedulingMode(task);
};

/**
 * Gets task statistics for a user
 * @param userId - The user ID
 * @returns Task statistics
 */
export const getTaskStats = async (userId: string) => {
    const total = await TaskRepository.countTasksByUser(userId);
    const completed = await TaskRepository.countCompletedTasksByUser(userId);
    const active = total - completed;

    return {
        total,
        completed,
        active,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
};

/**
 * Gets overdue tasks for a user
 * @param userId - The user ID
 * @returns Array of overdue tasks
 */
export const getOverdueTasks = async (userId: string) => {
    const tasks = await TaskRepository.findOverdueTasksByUser(userId);
    return tasks.map(TaskRepository.formatTask);
};

/**
 * Gets tasks due today for a user
 * @param userId - The user ID
 * @returns Array of tasks due today
 */
export const getDueTodayTasks = async (userId: string) => {
    const tasks = await TaskRepository.findDueTodayTasksByUser(userId);
    return tasks.map(TaskRepository.formatTask);
};

/**
 * Gets active tasks for a user
 * @param userId - The user ID
 * @returns Array of active tasks
 */
export const getActiveTasks = async (userId: string) => {
    const tasks = await TaskRepository.findActiveTasksByUser(userId);
    return tasks.map(TaskRepository.formatTask);
};

/**
 * Gets completed tasks for a user
 * @param userId - The user ID
 * @returns Array of completed tasks
 */
export const getCompletedTasks = async (userId: string) => {
    const tasks = await TaskRepository.findCompletedTasksByUser(userId);
    return tasks.map(TaskRepository.formatTask);
};