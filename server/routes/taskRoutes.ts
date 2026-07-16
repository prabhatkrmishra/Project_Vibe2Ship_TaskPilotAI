import express from "express";
import {verifyToken} from "../middleware/auth.ts";
import {
    createTask,
    getTasks,
    getTaskById,
    updateTask,
    deleteTask,
    getTaskStats,
    getOverdueTasks,
    getDueTodayTasks,
    getActiveTasks,
    getCompletedTasks
} from "../controllers/taskController.ts";

// ─── Task Routes ──────────────────────────────────────────────────────────────
// This file defines all routes related to tasks.
// Handles HTTP requests for task operations.

const router = express.Router();

// All task routes require authentication
router.use(verifyToken);

// Task statistics and filters (must be before /:id to avoid param capture)
router.get("/stats", getTaskStats);
router.get("/overdue", getOverdueTasks);
router.get("/due-today", getDueTodayTasks);
router.get("/active", getActiveTasks);
router.get("/completed", getCompletedTasks);

// Task CRUD endpoints
router.get("/", getTasks);
router.post("/", createTask);
router.get("/:id", getTaskById);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export {router as taskRoutes};