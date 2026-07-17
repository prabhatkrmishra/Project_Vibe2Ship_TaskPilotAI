import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import * as UserRepository from "../repositories/userRepository.js";
import * as PricingRepository from "../repositories/pricingRepository.js";
import {sendInternalError, sendNotFound, sendBadRequest} from "../lib/controllerUtils.js";

export const getAllPricingConfigs = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const plans = await PricingRepository.findAllPlans();
        res.json({plans});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const updatePricingConfig = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const {planId} = req.params;
        const {basePrice, salePrice, saleActive, saleLabel, name, description, features, popular, enabled} = req.body;
        const plan = await PricingRepository.findPlanById(planId);
        if (!plan) return sendNotFound(res, "Plan");

        const update: any = {updatedAt: new Date()};
        if (basePrice !== undefined) update.basePrice = basePrice;
        if (salePrice !== undefined) update.salePrice = salePrice;
        if (saleActive !== undefined) update.saleActive = saleActive;
        if (saleLabel !== undefined) update.saleLabel = saleLabel;
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (features !== undefined) update.features = features;
        if (popular !== undefined) update.popular = popular;
        if (enabled !== undefined) update.enabled = enabled;

        const updated = await PricingRepository.updatePlan(planId, update);
        res.json({success: true, plan: updated});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const createPricingConfig = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const {
            planId,
            name,
            description,
            basePrice,
            salePrice,
            saleActive,
            saleLabel,
            interval,
            features,
            popular,
            enabled
        } = req.body;
        if (!planId || !name || basePrice === undefined || !interval) {
            return sendBadRequest(res, "planId, name, basePrice, and interval are required");
        }
        if (typeof basePrice !== 'number' || basePrice <= 0) {
            return sendBadRequest(res, "basePrice must be a positive number");
        }
        if (!['month', 'year'].includes(interval)) {
            return sendBadRequest(res, "interval must be 'month' or 'year'");
        }
        const existing = await PricingRepository.findPlanById(planId);
        if (existing) return sendBadRequest(res, "Plan ID already exists");
        const plan = await PricingRepository.upsertPlan(planId, {
            planId, name, description, basePrice, salePrice, saleActive, saleLabel,
            interval, features, popular, enabled
        });
        res.json({success: true, plan});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const deletePricingConfig = async (req: Request, res: Response) => {
    try {
        await connectDB();
        await PricingRepository.deletePlan(req.params.planId);
        res.json({success: true});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const getSubscriptionsOverview = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const users = await UserRepository.findUsers({isPremium: true}, {
            select: 'email name isPremium premiumExpiry subscriptionPlan subscriptionActive subscriptions createdAt',
            sort: {createdAt: -1},
            limit: 100
        });
        const totalPremium = await UserRepository.countUsers({isPremium: true});
        const totalRevenue = await UserRepository.aggregateUsers([
            {$unwind: '$subscriptions'},
            {$group: {_id: null, total: {$sum: '$subscriptions.amount'}}}
        ]);
        res.json({
            users,
            stats: {
                totalPremium,
                totalRevenue: totalRevenue[0]?.total || 0
            }
        });
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const makeUserAdmin = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const {email} = req.body;
        if (!email) return sendBadRequest(res, "Email is required");
        const user = await UserRepository.findUserByEmail(email);
        if (!user) return sendNotFound(res, "User");
        user.role = 'admin';
        await user.save();
        res.json({success: true, message: `${email} is now an admin`});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const expireSubscriptions = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const now = new Date();
        const result = await UserRepository.updateUserMany(
            {isPremium: true, premiumExpiry: {$lt: now}},
            {$set: {isPremium: false, subscriptionActive: false}}
        );
        await UserRepository.updateUserMany(
            {'subscriptions.status': 'active'},
            {$set: {'subscriptions.$[elem].status': 'expired'}},
            {arrayFilters: [{'elem.status': 'active', 'elem.expiry': {$lt: now}}]}
        );
        res.json({success: true, expired: result.modifiedCount});
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
