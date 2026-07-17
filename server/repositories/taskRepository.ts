import {Task} from "../db/mongodb.js";

// ─── Task Repository ──────────────────────────────────────────────────────────
// This file contains data access methods for Task entities.
// Implements CRUD operations and queries specific to tasks.

/**
 * Finds a task by its ID
 * @param id - The task ID
 * @returns The task document or null if not found
 */
export const findTaskById = (id: string) => Task.findById(id);

/**
 * Finds a task by its ID scoped to a user
 * @param id - The task ID
 * @param userId - The user ID to scope the query to
 * @returns The task document or null if not found
 */
export const findTaskByIdForUser = (id: string, userId: string) =>
    Task.findOne({_id: id, userId});

/**
 * Finds tasks by user ID sorted by createdAt descending
 * @param userId - The user ID
 * @returns Array of task documents
 */
export const findTasksByUser = (userId: string) => Task.find({userId}).sort({createdAt: -1});

/**
 * Finds tasks by goal ID
 * @param goalId - The goal ID
 * @returns Array of task documents
 */
export const findTasksByGoal = (goalId: string) => Task.find({goalId});

/**
 * Creates a new task
 * @param data - Task data to create
 * @returns The created task document
 */
export const createTask = (data: Partial<any>) => Task.create(data);

/**
 * Updates a task by ID
 * @param id - The task ID
 * @param userId - The user ID
 * @param update - Update data
 * @returns The updated task document or null if not found
 */
export const updateTaskById = (id: string, userId: string, update: Partial<any>) =>
    Task.findOneAndUpdate({_id: id, userId}, update, {returnDocument: 'after'});

/**
 * Deletes a task by ID
 * @param id - The task ID
 * @param userId - The user ID
 * @returns The deleted task document or null if not found
 */
export const deleteTaskById = (id: string, userId: string) =>
    Task.findOneAndDelete({_id: id, userId});

/**
 * Finds completed tasks by user ID
 * @param userId - The user ID
 * @returns Array of completed task documents
 */
export const findCompletedTasksByUser = (userId: string) =>
    Task.find({userId, status: 'completed'});

/**
 * Finds active (non-completed) tasks by user ID
 * @param userId - The user ID
 * @returns Array of active task documents
 */
export const findActiveTasksByUser = (userId: string) =>
    Task.find({userId, status: {$ne: 'completed'}});

/**
 * Finds overdue tasks by user ID
 * @param userId - The user ID
 * @returns Array of overdue task documents
 */
export const findOverdueTasksByUser = (userId: string) =>
    Task.find({
        userId,
        deadline: {$lt: new Date()},
        status: {$ne: 'completed'}
    });

/**
 * Finds tasks due today by user ID
 * @param userId - The user ID
 * @returns Array of tasks due today
 */
export const findDueTodayTasksByUser = (userId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return Task.find({
        userId,
        deadline: {$gte: today, $lt: tomorrow},
        status: {$ne: 'completed'}
    });
};

/**
 * Counts total tasks for a user
 * @param userId - The user ID
 * @returns Count of tasks
 */
export const countTasksByUser = (userId: string) =>
    Task.countDocuments({userId});

/**
 * Counts completed tasks for a user
 * @param userId - The user ID
 * @returns Count of completed tasks
 */
export const countCompletedTasksByUser = (userId: string) =>
    Task.countDocuments({userId, status: 'completed'});

/**
 * Deletes all tasks matching a goalId and userId
 * @param goalId - The goal ID
 * @param userId - The user ID
 * @returns The result of the delete operation
 */
export const deleteTasksByGoalAndUser = (goalId: string, userId: string) =>
    Task.deleteMany({goalId, userId});

export const deleteTasksByUserIds = (userIds: string[]) =>
    Task.deleteMany({userId: {$in: userIds}});

/**
 * Formats a task document for API response
 * @param task - The task document
 * @returns Formatted task object
 */
export const formatTask = (task: any) => {
    const obj = task.toObject();
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
};