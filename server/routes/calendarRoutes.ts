import express from "express";
import {getCalendarEvents, createCalendarEvent} from "../controllers/calendarController.js";
import {verifyToken} from "../middleware/auth.js";

const router = express.Router();

router.get("/events", verifyToken, getCalendarEvents);
router.post("/events", verifyToken, createCalendarEvent);

export {router as calendarRoutes};
