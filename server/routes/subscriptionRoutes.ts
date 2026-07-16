import express from "express";
import {verifyToken} from "../middleware/auth.ts";
import {paymentLimiter} from "../middleware/rateLimit.ts";
import {
    createOrder,
    createPaymentLink,
    verifyPayment,
    cancelSubscription,
    getSubscriptionStatus,
} from "../controllers/subscriptionController.ts";

const router = express.Router();

router.post("/create-order", verifyToken, paymentLimiter, createOrder);
router.post("/payment-link", verifyToken, paymentLimiter, createPaymentLink);
router.post("/verify", verifyToken, paymentLimiter, verifyPayment);
router.post("/cancel", verifyToken, paymentLimiter, cancelSubscription);
router.get("/status", verifyToken, getSubscriptionStatus);

export {router as subscriptionRoutes};
