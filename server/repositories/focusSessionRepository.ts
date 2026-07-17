import {FocusSession} from "../db/mongodb.js";

export const createSession = (data: any) => FocusSession.create(data);

export const findSessionsByUser = (userId: string, filter: any = {}, limit: number = 100) =>
    FocusSession.find({userId, ...filter}).sort({startedAt: -1}).limit(limit);

export const findSessionById = (id: string) => FocusSession.findById(id);

export const aggregateStats = (userId: string, matchStage: any) =>
    FocusSession.aggregate([
        {$match: matchStage},
        {
            $addFields: {
                mins: {$round: [{$divide: ['$actualDuration', 60]}, 0]},
                dateStr: {$dateToString: {format: '%Y-%m-%d', date: '$startedAt'}},
            }
        },
        {
            $facet: {
                methodBreakdown: [{$group: {_id: '$method', total: {$sum: '$mins'}}}],
                heatmap: [
                    {$group: {_id: '$dateStr', total: {$sum: '$mins'}}},
                    {$project: {_id: 0, day: '$_id', total: 1}}
                ],
            }
        }
    ]);

export const deleteSessionsByUserIds = (userIds: string[]) =>
    FocusSession.deleteMany({userId: {$in: userIds}});

export const getFocusStats = (userId: string, matchStage: any, todayStr: string, weekStart: Date, monthStart: Date) =>
    FocusSession.aggregate([
        {$match: matchStage},
        {
            $addFields: {
                mins: {$round: [{$divide: ['$actualDuration', 60]}, 0]},
                dateStr: {$dateToString: {format: '%Y-%m-%d', date: '$startedAt'}},
                isToday: {$eq: [{$dateToString: {format: '%Y-%m-%d', date: '$startedAt'}}, todayStr]},
                isWeek: {$gte: ['$startedAt', weekStart]},
                isMonth: {$gte: ['$startedAt', monthStart]},
            }
        },
        {
            $facet: {
                methodBreakdown: [{$group: {_id: '$method', total: {$sum: '$mins'}}}],
                heatmap: [
                    {$group: {_id: '$dateStr', total: {$sum: '$mins'}}},
                    {$project: {_id: 0, day: '$_id', total: 1}}
                ],
                today: [
                    {$match: {isToday: true}},
                    {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                ],
                week: [
                    {$match: {isWeek: true}},
                    {
                        $group: {
                            _id: {$dateToString: {format: '%a', date: '$startedAt'}},
                            minutes: {$sum: '$mins'}
                        }
                    }
                ],
                weekTotals: [
                    {$match: {isWeek: true}},
                    {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                ],
                month: [
                    {$match: {isMonth: true}},
                    {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                ],
            }
        }
    ]);

export const formatSession = (doc: any) => {
    const obj = doc.toObject();
    obj.id = obj._id.toString();
    delete obj._id;
    delete obj.__v;
    return obj;
};
