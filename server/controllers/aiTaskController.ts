import {Request, Response} from "express";
import * as AITaskService from "../services/aiTaskService.js";

export const analyzeTask = async (req: any, res: Response) => {
    try {
        await AITaskService.analyzeTask(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to analyze task"});
    }
};

export const generateQuestSteps = async (req: any, res: Response) => {
    try {
        await AITaskService.generateQuestSteps(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to generate quest steps"});
    }
};

export const generateSubtasks = async (req: any, res: Response) => {
    try {
        await AITaskService.generateSubtasks(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to generate subtasks"});
    }
};

export const audioJournal = async (req: any, res: Response) => {
    try {
        await AITaskService.audioJournal(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to process audio journal"});
    }
};

export const generatePlan = async (req: any, res: Response) => {
    try {
        await AITaskService.generatePlan(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to generate plan"});
    }
};

export const autonomousPipeline = async (req: any, res: Response) => {
    try {
        await AITaskService.autonomousPipeline(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Failed to run pipeline"});
    }
};

export const chatWithAI = async (req: any, res: Response) => {
    try {
        await AITaskService.chatWithAI(req, res);
    } catch (e: any) {
        res.status(500).json({error: e.message || "Chat failed"});
    }
};

export const checkAIUsage = AITaskService.checkAIUsage;
export const FREE_TIER_LIMITS = AITaskService.FREE_TIER_LIMITS;
