import express from "express";
import {register} from "../controllers/authController.ts";
import {authLimiter} from "../middleware/rateLimit.ts";

const router = express.Router();

router.post("/register/user", authLimiter, register);

export {router as legacyRegisterRoutes};
