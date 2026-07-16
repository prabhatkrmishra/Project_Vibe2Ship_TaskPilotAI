import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.ts";
import {sendInternalError} from "../lib/controllerUtils.ts";
import {findAllEnabledPlans} from "../repositories/pricingRepository.ts";

export const getPricingPlans = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const plans = await findAllEnabledPlans();
        res.json({plans});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
