import {Request, Response} from "express";
import {sendEmail} from "../services/emailService.js";

export const sendEmailHandler = async (req: any, res: Response) => {
    try {
        const {to, subject, text, html} = req.body;

        if (!to || !subject || !text) {
            return res.status(400).json({error: "to, subject, and text are required"});
        }
        if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return res.status(400).json({error: "Invalid email address"});
        }
        if (subject.length > 200) return res.status(400).json({error: "Subject too long (max 200 chars)"});
        if (text.length > 10000) return res.status(400).json({error: "Email body too long (max 10,000 chars)"});

        const sent = await sendEmail(to, subject, text, html);

        if (!sent) {
            return res.status(500).json({error: "Failed to send email. Check that SMTP credentials are configured correctly."});
        }

        res.json({success: true, message: "Email sent successfully"});
    } catch (error: any) {
        console.error("Send email error:", error);
        res.status(500).json({error: error.message || "Failed to send email"});
    }
};
