import express from "express";
import {verifyToken} from "../middleware/auth";
import {chatLimiter} from "../middleware/rateLimit";
import {
    analyzeTask, generateQuestSteps, generateSubtasks, audioJournal,
    generatePlan, autonomousPipeline, chatWithAI, checkAIUsage
} from "../controllers/aiTaskController";

const router = express.Router();

router.post("/analyze-task", verifyToken, checkAIUsage, analyzeTask);
router.post("/generate-quest-steps", verifyToken, checkAIUsage, generateQuestSteps);
router.post("/generate-subtasks", verifyToken, checkAIUsage, generateSubtasks);
router.post("/audio-journal", verifyToken, checkAIUsage, audioJournal);
router.post("/generate-plan", verifyToken, checkAIUsage, generatePlan);
router.post("/autonomous-pipeline", verifyToken, checkAIUsage, autonomousPipeline);
router.post("/chat", verifyToken, chatLimiter, checkAIUsage, chatWithAI);

export {router as aiTaskRoutes};
