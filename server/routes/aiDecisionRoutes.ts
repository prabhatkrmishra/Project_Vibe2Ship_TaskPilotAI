import express from "express";
import {getAIDecisions, createAIDecision} from "../controllers/aiDecisionController";
import {verifyToken} from "../middleware/auth";

const router = express.Router();

router.get("/", verifyToken, getAIDecisions);
router.post("/", verifyToken, createAIDecision);

export {router as aiDecisionRoutes};
