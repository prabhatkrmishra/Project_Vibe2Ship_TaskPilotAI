import express from "express";
import {verifyToken} from "../middleware/auth";
import {listModels} from "../controllers/modelsController";

const router = express.Router();

router.get("/", verifyToken, listModels);

export {router as modelsRoutes};
