import express from "express";
import {verifyToken} from "../middleware/auth.js";
import {paymentLimiter} from "../middleware/rateLimit.js";
import {
    createOrder,
    createPaymentLink,
    verifyPayment,
    cancelSubscription,
    getSubscriptionStatus,
} from "../controllers/subscriptionController.js";

const router = express.Router();

router.post("/create-order", verifyToken, paymentLimiter, createOrder);
router.post("/payment-link", verifyToken, paymentLimiter, createPaymentLink);
router.post("/verify", verifyToken, paymentLimiter, verifyPayment);
router.post("/cancel", verifyToken, paymentLimiter, cancelSubscription);
router.get("/status", verifyToken, getSubscriptionStatus);

export {router as subscriptionRoutes};
