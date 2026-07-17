import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {listModels} from "../controllers/modelsController.js";

const router = express.Router();

router.get("/", verifyToken, listModels);

export {router as modelsRoutes};
