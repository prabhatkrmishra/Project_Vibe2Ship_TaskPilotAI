import {PricingConfig} from "../db/mongodb.ts";

export const findPlanById = (planId: string) =>
    PricingConfig.findOne({planId});

export const findEnabledPlanById = (planId: string) =>
    PricingConfig.findOne({planId, enabled: true});

export const findAllEnabledPlans = () =>
    PricingConfig.find({enabled: true}).sort({basePrice: 1});

export const findAllPlans = () =>
    PricingConfig.find().sort({basePrice: 1});

export const upsertPlan = (planId: string, data: any) =>
    PricingConfig.findOneAndUpdate({planId}, {$set: data}, {upsert: true, returnDocument: 'after'});

export const deletePlan = (planId: string) =>
    PricingConfig.findOneAndDelete({planId});

export const updatePlan = (planId: string, data: any) =>
    PricingConfig.findOneAndUpdate({planId}, {$set: data}, {returnDocument: 'after'});

export const countPricingConfigs = () =>
    PricingConfig.countDocuments();

export const insertManyPricingConfigs = (docs: any[]) =>
    PricingConfig.insertMany(docs);
