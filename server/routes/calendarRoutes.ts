import express from "express";
import {getCalendarEvents, createCalendarEvent} from "../controllers/calendarController";
import {verifyToken} from "../middleware/auth";

const router = express.Router();

router.get("/events", verifyToken, getCalendarEvents);
router.post("/events", verifyToken, createCalendarEvent);

export {router as calendarRoutes};
