import express from "express";
import {getPricingPlans} from "../controllers/pricingController.js";

const router = express.Router();

router.get("/", getPricingPlans);

export {router as pricingRoutes};
