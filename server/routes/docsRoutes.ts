import express from "express";
import {verifyToken} from "../middleware/auth";
import {checkAIUsage} from "../controllers/aiTaskController";
import {createDocument, generateReport, generatePresentation, createSpreadsheet} from "../controllers/docsController";

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
