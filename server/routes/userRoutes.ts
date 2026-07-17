import express from "express";
import {unlockPersonality, setActivePersonality} from "../controllers/authController.js";
import {verifyToken} from "../middleware/auth.js";

const router = express.Router();

router.post("/personalities/unlock", verifyToken, unlockPersonality);
router.put("/personalities/active", verifyToken, setActivePersonality);

export {router as userRoutes};