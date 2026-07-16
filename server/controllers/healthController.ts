import {Request, Response} from "express";

export const healthCheck = (req: Request, res: Response) => {
    res.json({status: "ok"});
};

export const getConfig = async (req: Request, res: Response) => {
    res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        appUrl: process.env.FRONTEND_URL,
    });
};
