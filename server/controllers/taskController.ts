import {Request, Response} from "express";
import * as TaskService from "../services/taskService.js";
import {createTaskSchema, updateTaskSchema} from "../validation/schemas.js";
import {sendNotFound, sendInternalError, sendValidationError} from "../lib/controllerUtils.js";

export const createTask = async (req: Request, res: Response) => {
    try {
        const parsed = createTaskSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const newTask = await TaskService.createTask(parsed.data, req.uid);
        res.status(201).json(newTask);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to create task");
    }
};

export const getTasks = async (req: Request, res: Response) => {
    try {
        const tasks = await TaskService.getTasksByUser(req.uid);
        res.json(tasks);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch tasks");
    }
};

export const getTaskById = async (req: Request, res: Response) => {
    try {
        const task = await TaskService.getTaskById(req.params.id, req.uid);
        if (!task) return sendNotFound(res, "Task");
        res.json(task);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch task");
    }
};

export const updateTask = async (req: Request, res: Response) => {
    try {
        const parsed = updateTaskSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const updatedTask = await TaskService.updateTask(req.params.id, req.uid, parsed.data);
        if (!updatedTask) return sendNotFound(res, "Task");
        res.json(updatedTask);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to update task");
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    try {
        const deletedTask = await TaskService.deleteTask(req.params.id, req.uid);
        if (!deletedTask) return sendNotFound(res, "Task");
        res.json({success: true});
    } catch (error: any) {
        sendInternalError(res, error, "Failed to delete task");
    }
};

export const getTaskStats = async (req: Request, res: Response) => {
    try {
        const stats = await TaskService.getTaskStats(req.uid);
        res.json(stats);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch task stats");
    }
};

export const getOverdueTasks = async (req: Request, res: Response) => {
    try {
        const overdueTasks = await TaskService.getOverdueTasks(req.uid);
        res.json(overdueTasks);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch overdue tasks");
    }
};

export const getDueTodayTasks = async (req: Request, res: Response) => {
    try {
        const dueTodayTasks = await TaskService.getDueTodayTasks(req.uid);
        res.json(dueTodayTasks);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch due today tasks");
    }
};

export const getActiveTasks = async (req: Request, res: Response) => {
    try {
        const activeTasks = await TaskService.getActiveTasks(req.uid);
        res.json(activeTasks);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch active tasks");
    }
};

export const getCompletedTasks = async (req: Request, res: Response) => {
    try {
        const completedTasks = await TaskService.getCompletedTasks(req.uid);
        res.json(completedTasks);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch completed tasks");
    }
};
