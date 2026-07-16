import express from "express";
import {authRoutes} from "./authRoutes";
import {taskRoutes} from "./taskRoutes";
import {goalRoutes} from "./goalRoutes";
import {chatRoutes} from "./chatRoutes";
import {aiDecisionRoutes} from "./aiDecisionRoutes";
import {planRoutes} from "./planRoutes";
import {focusSessionRoutes} from "./focusSessionRoutes";
import {calendarRoutes} from "./calendarRoutes";
import {docsRoutes, presentationsRoutes, sheetsRoutes} from "./docsRoutes";
import {soundsRoutes} from "./soundsRoutes";
import {pricingRoutes} from "./pricingRoutes";
import {subscriptionRoutes} from "./subscriptionRoutes";
import {adminRoutes} from "./adminRoutes";
import {backupRoutes} from "./backupRoutes";
import {aiTaskRoutes} from "./aiTaskRoutes";
import {healthRoutes} from "./healthRoutes";
import {legacyRegisterRoutes} from "./legacyRegisterRoutes";
import {emailRoutes} from "./emailRoutes";
import {modelsRoutes} from "./modelsRoutes";
import {userRoutes} from "./userRoutes";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tasks", taskRoutes);
router.use("/goals", goalRoutes);
router.use("/chats", chatRoutes);
router.use("/ai-decisions", aiDecisionRoutes);
router.use("/plans", planRoutes);
router.use("/focus-sessions", focusSessionRoutes);
router.use("/calendar", calendarRoutes);
router.use("/docs", docsRoutes);
router.use("/presentations", presentationsRoutes);
router.use("/sheets", sheetsRoutes);
router.use("/sounds", soundsRoutes);
router.use("/pricing", pricingRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/admin", adminRoutes);
router.use("/backup", backupRoutes);
router.use("/", aiTaskRoutes);
router.use("/user", userRoutes);
router.use("/", healthRoutes);
router.use("/email", emailRoutes);
router.use("/models", modelsRoutes);

router.use(legacyRegisterRoutes);

export {router as router};
