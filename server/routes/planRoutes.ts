import express from "express";
import {getQuestTrail, getPlanByDate, upsertPlan, completeSession} from "../controllers/planController.ts";
import {verifyToken} from "../middleware/auth.ts";

const router = express.Router();

router.get("/trail/:goalId", verifyToken, getQuestTrail);
router.get("/:date", verifyToken, getPlanByDate);
router.post("/:date", verifyToken, upsertPlan);
router.post("/:date/complete-session", verifyToken, completeSession);

export {router as planRoutes};
