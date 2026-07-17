import {DailyPlanModel} from "../db/mongodb.js";

export const findPlanByUserAndDate = (userId: string, date: string) =>
    DailyPlanModel.findOne({userId, date});

export const findPlansByUser = (userId: string) =>
    DailyPlanModel.find({userId}).sort({date: -1});

export const upsertPlan = (userId: string, date: string, sessions: any[], carryForwardSubtasks?: any[]) =>
    DailyPlanModel.findOneAndUpdate(
        {userId, date},
        {$set: {sessions, carryForwardSubtasks: carryForwardSubtasks || [], updatedAt: new Date()}},
        {upsert: true, returnDocument: 'after'}
    );

export const deletePlanByUserAndDate = (userId: string, date: string) =>
    DailyPlanModel.findOneAndDelete({userId, date});

export const deletePlansByUserIds = (userIds: string[]) =>
    DailyPlanModel.deleteMany({userId: {$in: userIds}});

export const upsertPlanSessions = (userId: string, date: string, sessions: any[]) =>
    DailyPlanModel.findOneAndUpdate(
        {userId, date},
        {$set: {sessions, updatedAt: new Date()}},
        {upsert: true, returnDocument: 'after'}
    );

export const upsertPlanCarryForward = (userId: string, date: string, carryForwardSubtasks: any[]) =>
    DailyPlanModel.findOneAndUpdate(
        {userId, date},
        {$set: {carryForwardSubtasks, updatedAt: new Date()}},
        {upsert: true}
    );

export const completeSession = (userId: string, date: string, sessionIndex: number) =>
    DailyPlanModel.findOneAndUpdate(
        {userId, date, [`sessions.${sessionIndex}.completed`]: false},
        {$set: {[`sessions.${sessionIndex}.completed`]: true, [`sessions.${sessionIndex}.started`]: true}},
        {returnDocument: 'after'}
    );

export const formatPlan = (plan: any) => {
    if (!plan) return plan;
    const obj = plan.toObject ? plan.toObject() : {...plan};
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
};
