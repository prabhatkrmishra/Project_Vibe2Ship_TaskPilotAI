import express from "express";
import {healthCheck, getConfig} from "../controllers/healthController.js";

const router = express.Router();

router.get("/health", healthCheck);
router.get("/config", getConfig);

export {router as healthRoutes};
