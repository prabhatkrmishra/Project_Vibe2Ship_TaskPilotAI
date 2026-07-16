import express from "express";
import {
    register,
    login,
    guestLogin,
    getMe,
    updateProfile,
    changePassword,
    forgotPassword,
    validateResetToken,
    resetPassword,
    getTwoFactorStatus,
    setupTwoFactor,
    verifyTwoFactor,
    disableTwoFactor,
    validateTwoFactorLogin,
    googleCallback,
    sendVerification,
    verifyEmailToken
} from "../controllers/authController.ts";
import {verifyToken} from "../middleware/auth.ts";
import {authLimiter, guestLimiter} from "../middleware/rateLimit.ts";

const router = express.Router();

router.route("/register").post(authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/guest", guestLimiter, guestLogin);
router.post("/forgot-password", authLimiter, forgotPassword);
router.get("/reset-password/:token", authLimiter, validateResetToken);
router.post("/reset-password", authLimiter, resetPassword);

router.get("/me", verifyToken, getMe);
router.put("/profile", verifyToken, updateProfile);
router.post("/change-password", verifyToken, changePassword);

router.post("/2fa/status", verifyToken, getTwoFactorStatus);
router.post("/2fa/setup", verifyToken, setupTwoFactor);
router.post("/2fa/verify", authLimiter, verifyToken, verifyTwoFactor);
router.post("/2fa/disable", authLimiter, verifyToken, disableTwoFactor);
router.post("/2fa/validate-login", authLimiter, validateTwoFactorLogin);

router.post("/send-verification", verifyToken, sendVerification);
router.get("/verify-email", verifyEmailToken);

router.post("/google/callback", authLimiter, googleCallback);

export {router as authRoutes};
