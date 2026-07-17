import express from "express";
import {authRoutes} from "./authRoutes.js";
import {taskRoutes} from "./taskRoutes.js";
import {goalRoutes} from "./goalRoutes.js";
import {chatRoutes} from "./chatRoutes.js";
import {aiDecisionRoutes} from "./aiDecisionRoutes.js";
import {planRoutes} from "./planRoutes.js";
import {focusSessionRoutes} from "./focusSessionRoutes.js";
import {calendarRoutes} from "./calendarRoutes.js";
import {docsRoutes, presentationsRoutes, sheetsRoutes} from "./docsRoutes.js";
import {soundsRoutes} from "./soundsRoutes.js";
import {pricingRoutes} from "./pricingRoutes.js";
import {subscriptionRoutes} from "./subscriptionRoutes.js";
import {adminRoutes} from "./adminRoutes.js";
import {backupRoutes} from "./backupRoutes.js";
import {aiTaskRoutes} from "./aiTaskRoutes.js";
import {healthRoutes} from "./healthRoutes.js";
import {legacyRegisterRoutes} from "./legacyRegisterRoutes.js";
import {emailRoutes} from "./emailRoutes.js";
import {modelsRoutes} from "./modelsRoutes.js";
import {userRoutes} from "./userRoutes.js";

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
