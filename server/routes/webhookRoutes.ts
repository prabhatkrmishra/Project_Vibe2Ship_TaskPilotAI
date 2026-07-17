import express from "express";
import {razorpayWebhook} from "../controllers/webhookController.js";

const router = express.Router();

router.post("/razorpay", express.raw({type: 'application/json'}), razorpayWebhook);

export {router as webhookRoutes};
