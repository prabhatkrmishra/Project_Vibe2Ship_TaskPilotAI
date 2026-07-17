import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {emailLimiter} from "../middleware/rateLimit.js";
import {sendEmailHandler} from "../controllers/emailController.js";

const router = express.Router();

router.post("/send", verifyToken, emailLimiter, sendEmailHandler);

export {router as emailRoutes};
