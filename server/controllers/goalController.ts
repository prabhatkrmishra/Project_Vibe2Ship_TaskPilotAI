import {Request, Response} from "express";
import * as GoalService from "../services/goalService.js";
import {createGoalSchema, updateGoalSchema} from "../validation/schemas.js";
import {sendNotFound, sendInternalError, sendValidationError} from "../lib/controllerUtils.js";

export const createGoal = async (req: Request, res: Response) => {
    try {
        const parsed = createGoalSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const newGoal = await GoalService.createGoal(parsed.data, req.uid!);
        res.status(201).json(newGoal);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to create goal");
    }
};

export const getGoals = async (req: Request, res: Response) => {
    try {
        const goals = await GoalService.getGoalsByUser(req.uid!);
        res.json(goals);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch goals");
    }
};

export const getGoalById = async (req: Request, res: Response) => {
    try {
        const goal = await GoalService.getGoalById(req.params.id, req.uid!);
        if (!goal) return sendNotFound(res, "Goal");
        res.json(goal);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch goal");
    }
};

export const updateGoal = async (req: Request, res: Response) => {
    try {
        const parsed = updateGoalSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const updatedGoal = await GoalService.updateGoal(req.params.id, req.uid!, parsed.data);
        if (!updatedGoal) return sendNotFound(res, "Goal");
        res.json(updatedGoal);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to update goal");
    }
};

export const deleteGoal = async (req: Request, res: Response) => {
    try {
        const deletedGoal = await GoalService.deleteGoal(req.params.id, req.uid!);
        if (!deletedGoal) return sendNotFound(res, "Goal");
        res.json({success: true});
    } catch (error: any) {
        sendInternalError(res, error, "Failed to delete goal");
    }
};

export const getGoalStats = async (req: Request, res: Response) => {
    try {
        const stats = await GoalService.getGoalStats(req.uid!);
        res.json(stats);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch goal stats");
    }
};

export const getActiveGoals = async (req: Request, res: Response) => {
    try {
        const activeGoals = await GoalService.getActiveGoals(req.uid!);
        res.json(activeGoals);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch active goals");
    }
};

export const getArchivedGoals = async (req: Request, res: Response) => {
    try {
        const archivedGoals = await GoalService.getArchivedGoals(req.uid!);
        res.json(archivedGoals);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch archived goals");
    }
};

export const getDueTodayGoals = async (req: Request, res: Response) => {
    try {
        const dueTodayGoals = await GoalService.getDueTodayGoals(req.uid!);
        res.json(dueTodayGoals);
    } catch (error: any) {
        sendInternalError(res, error, "Failed to fetch due today goals");
    }
};
