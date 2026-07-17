import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {checkAIUsage} from "../controllers/aiTaskController.js";
import {createDocument, generateReport, generatePresentation, createSpreadsheet} from "../controllers/docsController.js";

const router = express.Router();

router.post("/", verifyToken, createDocument);
router.post("/generate-report", verifyToken, checkAIUsage, generateReport);

export {router as docsRoutes};

const presentationRouter = express.Router();
presentationRouter.post("/generate", verifyToken, checkAIUsage, generatePresentation);
export {presentationRouter as presentationsRoutes};

const sheetsRouter = express.Router();
sheetsRouter.post("/", verifyToken, createSpreadsheet);
export {sheetsRouter as sheetsRoutes};
