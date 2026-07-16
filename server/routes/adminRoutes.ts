import express from "express";
import {verifyToken, requireAdmin} from "../middleware/auth.ts";
import {
    getAllPricingConfigs,
    updatePricingConfig,
    createPricingConfig,
    deletePricingConfig,
    getSubscriptionsOverview,
    makeUserAdmin,
    expireSubscriptions
} from "../controllers/adminController.ts";

const router = express.Router();

router.get("/pricing", verifyToken, requireAdmin, getAllPricingConfigs);
router.put("/pricing/:planId", verifyToken, requireAdmin, updatePricingConfig);
router.post("/pricing", verifyToken, requireAdmin, createPricingConfig);
router.delete("/pricing/:planId", verifyToken, requireAdmin, deletePricingConfig);
router.get("/subscriptions", verifyToken, requireAdmin, getSubscriptionsOverview);
router.post("/make-admin", verifyToken, requireAdmin, makeUserAdmin);
router.post("/expire-subscriptions", verifyToken, requireAdmin, expireSubscriptions);

export {router as adminRoutes};
