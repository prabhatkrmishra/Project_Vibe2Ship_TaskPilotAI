import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import {sendInternalError, sendNotFound} from "../lib/controllerUtils.js";
import {findUserByIdSelect} from "../repositories/userRepository.js";

const BINAURAL_SOUNDS = [
    {id: "delta", label: "Delta (2 Hz)", category: "binaural", freqL: 200, freqR: 202},
    {id: "theta", label: "Theta (6 Hz)", category: "binaural", freqL: 200, freqR: 206},
    {id: "alpha", label: "Alpha (10 Hz)", category: "binaural", freqL: 200, freqR: 210},
    {id: "beta", label: "Beta (20 Hz)", category: "binaural", freqL: 200, freqR: 220},
    {id: "gamma", label: "Gamma (40 Hz)", category: "binaural", freqL: 200, freqR: 240},
];

export const getBinauralStatus = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const user = await findUserByIdSelect((req as any).uid, "isPremium premiumExpiry");
        if (!user) return sendNotFound(res, "User");

        const now = new Date();
        const isExpired = user.premiumExpiry && user.premiumExpiry < now;
        const isActive = user.isPremium && !isExpired;

        res.json({
            isPremium: isActive,
            premiumExpiry: user.premiumExpiry,
        });
    } catch (error: any) {
        console.error("Sound status check error:", error);
        sendInternalError(res, error);
    }
};

export const getBinauralSounds = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const user = await findUserByIdSelect((req as any).uid, "isPremium premiumExpiry");
        if (!user) return sendNotFound(res, "User");

        const now = new Date();
        const isExpired = user.premiumExpiry && user.premiumExpiry < now;
        const isPremium = user.isPremium && !isExpired;

        if (!isPremium) {
            return res.status(403).json({
                error: "Premium required",
                message: "Binaural sounds require a Premium subscription",
            });
        }

        res.json({sounds: BINAURAL_SOUNDS});
    } catch (error: any) {
        console.error("Binaural sounds fetch error:", error);
        sendInternalError(res, error);
    }
};
