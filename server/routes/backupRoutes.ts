import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {backupLimiter} from "../middleware/rateLimit.js";
import {exportBackup, signBackup, verifyBackup} from "../controllers/backupController.js";

const router = express.Router();

router.get("/export", verifyToken, exportBackup);
router.post("/sign", verifyToken, backupLimiter, signBackup);
router.post("/verify", verifyToken, verifyBackup);

export {router as backupRoutes};
