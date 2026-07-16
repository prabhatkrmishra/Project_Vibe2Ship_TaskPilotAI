import express from "express";
import {verifyToken} from "../middleware/auth";
import {emailLimiter} from "../middleware/rateLimit";
import {sendEmailHandler} from "../controllers/emailController";

const router = express.Router();

router.post("/send", verifyToken, emailLimiter, sendEmailHandler);

export {router as emailRoutes};
