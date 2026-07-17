import express from "express";
import {register} from "../controllers/authController.js";
import {authLimiter} from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/register/user", authLimiter, register);

export {router as legacyRegisterRoutes};
