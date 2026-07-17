import {AIUsage} from "../db/mongodb.js";

export const findOneUsage = (query: any) =>
    AIUsage.findOne(query);

export const incrementUsageCounter = (userId: string, date: string, endpoint: string, timestamp: Date) =>
    AIUsage.findOneAndUpdate(
        {userId, date, endpoint},
        {$inc: {count: 1}, $setOnInsert: {timestamp}},
        {upsert: true, returnDocument: 'after', rawResult: true}
    );

export const decrementUsageCounter = (userId: string, date: string, endpoint: string) =>
    AIUsage.findOneAndUpdate(
        {userId, date, endpoint},
        {$inc: {count: -1}}
    );

export const aggregateUsageByUserAndDate = (userId: string, date: string) =>
    AIUsage.aggregate([
        {$match: {userId, date}},
        {$group: {_id: '$endpoint', count: {$sum: '$count'}}}
    ]);

export const createUsage = (data: any) =>
    AIUsage.create(data);
