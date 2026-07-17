import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import {sendValidationError} from "../lib/controllerUtils.js";
import {createChatMessageSchema, renameChatSessionSchema} from "../validation/schemas.js";
import * as ChatRepo from "../repositories/chatRepository.js";
import * as ChatService from "../services/chatService.js";
import {sendInternalError, sendBadRequest} from "../lib/controllerUtils.js";

export const getChatsByUser = async (req: any, res: Response) => {
    try {
        await connectDB();
        const {chatId} = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 200, 1), 500);
        const skip = Math.max(parseInt(req.query.skip as string) || 0, 0);
        const chats = await ChatRepo.findMessagesByChatId(req.uid, chatId || null, limit, skip);
        const formatted = chats.map(c => {
            const obj = c.toObject();
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

export const getChatSessions = async (req: any, res: Response) => {
    try {
        await connectDB();
        const sessions = await ChatService.getSessions(req.uid);
        res.json(sessions);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const deleteChatSession = async (req: any, res: Response) => {
    try {
        await connectDB();
        const {chatId} = req.params;
        await ChatService.deleteSession(req.uid, chatId);
        res.json({success: true});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const renameChatSession = async (req: any, res: Response) => {
    try {
        await connectDB();
        const {chatId} = req.params;
        const parsed = renameChatSessionSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {title} = parsed.data;
        await ChatService.renameSession(req.uid, chatId, title);
        res.json({success: true, title});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const createChat = async (req: any, res: Response) => {
    try {
        await connectDB();
        const parsed = createChatMessageSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }
        const {role, content, chatId, chatTitle} = parsed.data;
        const newChat = await ChatService.createMessage({
            userId: req.uid,
            role,
            content: content.slice(0, 50000),
            chatId: (chatId || 'default').slice(0, 100),
            chatTitle: (chatTitle || 'New Chat').slice(0, 200),
            timestamp: new Date()
        });
        const obj = newChat.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        res.json(obj);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
