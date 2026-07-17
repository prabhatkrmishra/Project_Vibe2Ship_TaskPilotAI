import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import {sendInternalError} from "../lib/controllerUtils.js";
import {findAllEnabledPlans} from "../repositories/pricingRepository.js";

export const getPricingPlans = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const plans = await findAllEnabledPlans();
        res.json({plans});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
