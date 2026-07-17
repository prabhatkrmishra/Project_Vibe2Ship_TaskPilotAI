import {Request, Response} from "express";
import {connectDB} from "../db/mongodb.js";
import {normalizeSessions} from "../lib/scheduling.js";
import {
    findPlanByUserAndDate,
    findPlansByUser,
    upsertPlanSessions,
    completeSession as completeSessionAtomic,
    formatPlan
} from "../repositories/dailyPlanRepository.js";
import {findTasksByGoal, findTaskByIdForUser, updateTaskById} from "../repositories/taskRepository.js";
import {
    processGamificationOnTaskComplete,
    processGamificationOnSessionComplete,
    syncQuestProgress,
    awardQuestCompletionXP
} from "../lib/gamification.js";
import {sendInternalError, sendNotFound, sendBadRequest, sendConflict} from "../lib/controllerUtils.js";

export const getPlanByDate = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const plan = await findPlanByUserAndDate((req as any).uid, req.params.date);
        if (!plan) return sendNotFound(res, "Plan");
        const obj = plan.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        res.json(obj);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const upsertPlan = async (req: Request, res: Response) => {
    try {
        await connectDB();
        let {sessions, force} = req.body;
        if (sessions && Array.isArray(sessions)) {
            sessions = normalizeSessions(sessions);
        }

        if (sessions && Array.isArray(sessions)) {
            const existingPlan = await findPlanByUserAndDate((req as any).uid, req.params.date);

            if (existingPlan?.sessions?.some((s: any) => s.completed) && !force) {
                return sendConflict(res, "Plan has completed sessions. Send force: true to overwrite.");
            }
            const now = new Date().getTime();

            for (const session of sessions) {
                if (existingPlan?.sessions) {
                    const existingSession = existingPlan.sessions.find((s: any) => s.taskTitle === session.taskTitle && s.startTime === session.startTime);
                    if (existingSession?.started && session.started === undefined) {
                        session.started = true;
                    }
                }
            }

            for (const session of sessions) {
                if (session.completed) {
                    const end = new Date(session.endTime).getTime();
                    const isPast = now > end;
                    if (!isPast && !session.started) {
                        session.completed = false;
                    } else {
                        session.started = true;
                    }
                }
            }

            let activeFound = false;
            for (const session of sessions) {
                if (session.started && !session.completed) {
                    if (activeFound) {
                        session.started = false;
                    } else {
                        activeFound = true;
                    }
                }
            }
        }

        const plan = await upsertPlanSessions((req as any).uid, req.params.date, sessions);
        const obj = formatPlan(plan);
        res.json(obj);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const getQuestTrail = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const {goalId} = req.params;

        const tasks = await findTasksByGoal(goalId);
        const taskIds = new Set(tasks.map((t: any) => t._id.toString()));
        const taskTitleMap = new Map(tasks.map((t: any) => [t._id.toString(), t.title]));

        const plans = await findPlansByUser((req as any).uid);
        const trail: any[] = [];

        for (const plan of plans) {
            for (const session of plan.sessions) {
                if (session.completed && taskIds.has(session.taskId)) {
                    trail.push({
                        date: plan.date,
                        taskTitle: taskTitleMap.get(session.taskId) || session.taskTitle,
                        taskId: session.taskId,
                        sessionLabel: session.sessionLabel || session.taskTitle,
                        subtaskIds: session.subtaskIds || [],
                        startTime: session.startTime,
                        endTime: session.endTime
                    });
                }
            }
        }

        trail.sort((a, b) => {
            const dateCmp = a.date.localeCompare(b.date);
            if (dateCmp !== 0) return dateCmp;
            return a.startTime.localeCompare(b.startTime);
        });

        res.json(trail);
    } catch (error: any) {
        sendInternalError(res, error);
    }
};

export const completeSession = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const {sessionIndex} = req.body;
        if (sessionIndex === undefined || sessionIndex === null) {
            return sendBadRequest(res, "sessionIndex is required");
        }

        const plan = await findPlanByUserAndDate((req as any).uid, req.params.date);
        if (!plan) return sendNotFound(res, "Plan");
        if (!Number.isInteger(sessionIndex) || sessionIndex < 0 || sessionIndex >= plan.sessions.length) {
            return sendBadRequest(res, "Invalid session index");
        }

        const session = plan.sessions[sessionIndex];
        const now = new Date().getTime();
        const end = new Date(session.endTime).getTime();
        const isPast = now > end;

        if (!isPast && !session.started) {
            return sendBadRequest(res, "Session cannot be completed yet — must be started or past its end time");
        }

        if (session.completed) {
            return sendBadRequest(res, "Session already completed");
        }

        const atomicUpdate = await completeSessionAtomic((req as any).uid, req.params.date, sessionIndex);
        if (!atomicUpdate) {
            return sendBadRequest(res, "Session already completed");
        }
        const updatedSession = (atomicUpdate as any).sessions[sessionIndex];

        let taskUpdate = null;
        let gamificationUpdates = null;
        let questSync = null;
        let sessionGamification = null;

        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(session.taskId || '');
        if (session.taskId && isValidObjectId) {
            const task = await findTaskByIdForUser(session.taskId, (req as any).uid);
            if (task) {
                const coveredIds = new Set(session.subtaskIds || []);
                const hasSubtasks = task.subtasks && task.subtasks.length > 0;

                if (hasSubtasks && coveredIds.size > 0) {
                    const updatedSubtasks = task.subtasks.map((st: any) =>
                        coveredIds.has(st.id) ? {...st, completed: true} : st
                    );
                    const allSubtasksDone = updatedSubtasks.every((st: any) => st.completed);
                    const newStatus = allSubtasksDone ? 'completed' : 'in_progress';
                    const shouldAwardTaskGamification = allSubtasksDone && !task.hasBeenCompleted;

                    await updateTaskById(task._id.toString(), (req as any).uid, {
                        $set: {
                            subtasks: updatedSubtasks,
                            status: newStatus, ...(shouldAwardTaskGamification ? {
                                hasBeenCompleted: true,
                                completedAt: task.completedAt || new Date().toISOString()
                            } : {})
                        }
                    });

                    taskUpdate = {id: task._id.toString(), status: newStatus, subtasks: updatedSubtasks};

                    if (shouldAwardTaskGamification) {
                        gamificationUpdates = await processGamificationOnTaskComplete((req as any).uid, task);
                    }

                    if (task.goalId) {
                        questSync = await syncQuestProgress((req as any).uid, task.goalId);
                        if (questSync?.completed) {
                            await awardQuestCompletionXP((req as any).uid);
                        }
                    }
                } else if (!hasSubtasks) {
                    // Legacy fallback: task without subtasks (shouldn't happen with new scheduling)
                    const shouldAwardGamification = !task.hasBeenCompleted;
                    await updateTaskById(task._id.toString(), (req as any).uid, {
                        $set: {
                            status: 'completed',
                            hasBeenCompleted: true,
                            completedAt: task.completedAt || new Date().toISOString()
                        }
                    });
                    taskUpdate = {id: task._id.toString(), status: 'completed'};
                    if (shouldAwardGamification) {
                        gamificationUpdates = await processGamificationOnTaskComplete((req as any).uid, task);
                    }
                    if (task.goalId) {
                        questSync = await syncQuestProgress((req as any).uid, task.goalId);
                        if (questSync?.completed) {
                            await awardQuestCompletionXP((req as any).uid);
                        }
                    }
                }
            }
        }

        sessionGamification = await processGamificationOnSessionComplete((req as any).uid);

        const sessionObj = updatedSession.toObject ? updatedSession.toObject() : {...updatedSession};
        res.json({
            session: sessionObj,
            taskUpdate,
            gamificationUpdates,
            questSync,
            sessionGamification
        });
    } catch (error: any) {
        sendInternalError(res, error);
    }
};
