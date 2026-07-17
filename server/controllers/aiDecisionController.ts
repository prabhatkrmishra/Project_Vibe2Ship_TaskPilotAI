import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import * as AIDecisionRepo from "../repositories/aiDecisionRepository.js";
import {sendInternalError, sendBadRequest} from "../lib/controllerUtils.js";

export const getAIDecisions = async (req: any, res: Response) => {
    try {
        await connectDB();
        const decisions = await AIDecisionRepo.findAIDecisionsByUser(req.uid).sort({timestamp: -1});
        const formatted = decisions.map(d => {
            const obj = d.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            return obj;
        });
        res.json(formatted);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const createAIDecision = async (req: any, res: Response) => {
    try {
        await connectDB();
        const {title, reason} = req.body;
        const cleanTitle = typeof title === 'string' ? title.trim() : '';
        const cleanReason = typeof reason === 'string' ? reason.trim() : '';
        if (!cleanTitle || cleanTitle.length > 200) {
            return sendBadRequest(res, "Title is required and must be under 200 characters");
        }
        if (cleanReason.length > 2000) {
            return sendBadRequest(res, "Reason must be under 2000 characters");
        }
        const decision = await AIDecisionRepo.createAIDecision({
            userId: req.uid,
            title: cleanTitle,
            reason: cleanReason,
            timestamp: new Date()
        });
        const obj = decision.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        res.json(obj);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
