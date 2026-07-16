import express from "express";
import {
    getChatsByUser,
    getChatSessions,
    deleteChatSession,
    renameChatSession,
    createChat,
} from "../controllers/chatController.ts";
import {verifyToken} from "../middleware/auth.ts";

const router = express.Router();

router.get("/", verifyToken, getChatsByUser);
router.get("/sessions", verifyToken, getChatSessions);
router.delete("/sessions/:chatId", verifyToken, deleteChatSession);
router.put("/sessions/:chatId", verifyToken, renameChatSession);
router.post("/", verifyToken, createChat);

export {router as chatRoutes};
