import {Request, Response} from "express";
import {google} from "googleapis";
import {sendValidationError} from "../lib/controllerUtils.js";
import {createCalendarEventSchema} from "../validation/schemas.js";
import {sendInternalError, sendBadRequest} from "../lib/controllerUtils.js";

export const getCalendarEvents = async (req: any, res: Response) => {
    try {
        const accessToken = req.headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: "Bearer"});
        const calendar = google.calendar({version: "v3", auth: oauth2Client});

        const {timeMin, timeMax} = req.query;
        const response = await calendar.events.list({
            calendarId: "primary",
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
        });

        res.json(response.data);
    } catch (error: any) {
        console.error("Error fetching events:", error);
        sendInternalError(res, error);
    }
};

export const createCalendarEvent = async (req: any, res: Response) => {
    try {
        const accessToken = req.headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const parsed = createCalendarEventSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return sendValidationError(res, parsed.error.flatten().fieldErrors);
        }

        const {summary, description, start, end, location, reminders} = parsed.data;
        const safeBody: any = {summary: summary.substring(0, 500)};
        if (description) safeBody.description = description.substring(0, 5000);
        if (location) safeBody.location = location.substring(0, 500);
        if (start) safeBody.start = start;
        if (end) safeBody.end = end;
        if (reminders) safeBody.reminders = reminders;

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: "Bearer"});
        const calendar = google.calendar({version: "v3", auth: oauth2Client});

        const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: safeBody,
        });

        res.json(response.data);
    } catch (error: any) {
        console.error("Error creating event:", error);
        sendInternalError(res, error);
    }
};
