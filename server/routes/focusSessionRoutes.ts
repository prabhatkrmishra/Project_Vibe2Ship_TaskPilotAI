import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {
    createFocusSession,
    getFocusSessionStats,
    getFocusSessionHeatmap,
    getFocusSessions
} from "../controllers/focusSessionController.js";

const router = express.Router();

router.post("/", verifyToken, createFocusSession);
router.get("/stats", verifyToken, getFocusSessionStats);
router.get("/heatmap", verifyToken, getFocusSessionHeatmap);
router.get("/", verifyToken, getFocusSessions);

export {router as focusSessionRoutes};
