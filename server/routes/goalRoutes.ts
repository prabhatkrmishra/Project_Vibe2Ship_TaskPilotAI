import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {
    createGoal,
    getGoals,
    getGoalById,
    updateGoal,
    deleteGoal,
    getGoalStats,
    getActiveGoals,
    getArchivedGoals,
    getDueTodayGoals
} from "../controllers/goalController.js";

// ─── Goal Routes ──────────────────────────────────────────────────────────────
// This file defines all routes related to goals.
// Handles HTTP requests for goal operations.

const router = express.Router();

// All goal routes require authentication
router.use(verifyToken);

// Goal statistics and filters (must be before /:id to avoid param capture)
router.get("/stats", getGoalStats);
router.get("/active", getActiveGoals);
router.get("/archived", getArchivedGoals);
router.get("/due-today", getDueTodayGoals);

// Goal CRUD endpoints
router.get("/", getGoals);
router.post("/", createGoal);
router.get("/:id", getGoalById);
router.put("/:id", updateGoal);
router.delete("/:id", deleteGoal);

export {router as goalRoutes};