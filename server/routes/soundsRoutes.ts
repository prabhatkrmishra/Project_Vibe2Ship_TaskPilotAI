import express from "express";
import {getBinauralStatus, getBinauralSounds} from "../controllers/soundsController.js";
import {verifyToken} from "../middleware/auth.js";

const router = express.Router();

router.get("/binaural/status", verifyToken, getBinauralStatus);
router.get("/binaural", verifyToken, getBinauralSounds);

export {router as soundsRoutes};
