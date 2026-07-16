import express from "express";
import {generateGoogleAuthUrl, oauthCallback} from "../controllers/authController.ts";
import {authLimiter} from "../middleware/rateLimit.ts";

const router = express.Router();

router.get("/auth/google", generateGoogleAuthUrl);
router.get(["/oauth2callback", "/oauth2callback/"], authLimiter, oauthCallback);

export {router as googleOAuthRoutes};
