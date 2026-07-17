import {connectDB} from "../db/mongodb.js";
import {findUserById, findUserByIdSelect} from "../repositories/userRepository.js";
import {createTask} from "../repositories/taskRepository.js";
import {findGoalsByUserUnsorted} from "../repositories/goalRepository.js";
import {findPlanByUserAndDate, upsertPlanSessions, upsertPlanCarryForward} from "../repositories/dailyPlanRepository.js";
import {createAIDecision} from "../repositories/aiDecisionRepository.js";
import {incrementUsageCounter, decrementUsageCounter} from "../repositories/aiUsageRepository.js";
import {generateAIContent, getValidModel} from "../lib/ai.js";
import {normalizeSessions} from "../lib/scheduling.js";
import {safeError} from "../lib/utils.js";

const MAX_INPUT = {chat: 20000, journal: 10000, plan: 15000, quest: 5000, analyze: 5000} as const;

// ─── §5.1: Pure carry-forward extraction ─────────────────────────────────────
// Extracts unscheduled subtasks from yesterday's plan that need to be
// carried forward to today. Pure function — no I/O, fully testable.
export interface CarryForwardEntry {
    taskId: string;
    taskTitle: string;
    subtaskIds: string[];
}

export const extractCarryForwardSubtasks = (
    previousPlan: any,
    previousPlanCarryForward: CarryForwardEntry[] = []
): CarryForwardEntry[] => {
    const carryForward: CarryForwardEntry[] = [];

    if (previousPlan?.sessions) {
        for (const s of previousPlan.sessions) {
            if (s.schedulingMode === 'PACED_SUBTASKS' && !s.completed && s.subtaskIds?.length) {
                carryForward.push({taskId: s.taskId, taskTitle: s.taskTitle, subtaskIds: s.subtaskIds});
            }
        }
    }

    for (const cf of previousPlanCarryForward) {
        const existing = carryForward.find(c => c.taskId === cf.taskId);
        if (existing) {
            const newIds = cf.subtaskIds.filter((id: string) => !existing.subtaskIds.includes(id));
            existing.subtaskIds.push(...newIds);
        } else {
            carryForward.push({taskId: cf.taskId, taskTitle: cf.taskTitle, subtaskIds: cf.subtaskIds});
        }
    }

    return carryForward;
};

// ─── §5.1: Carry-forward merge for tomorrow ─────────────────────────────────
// Merges unscheduled SAME_DAY_SUBTASKS subtasks into tomorrow's carry-forward.
export const mergeCarryForwardForTomorrow = (
    existingCarry: CarryForwardEntry[],
    newUnscheduled: CarryForwardEntry[]
): CarryForwardEntry[] => {
    const existingIds = new Set(existingCarry.flatMap(c => c.subtaskIds));
    const newCarry = newUnscheduled.map(cf => ({
        ...cf,
        subtaskIds: cf.subtaskIds.filter(id => !existingIds.has(id))
    })).filter(cf => cf.subtaskIds.length > 0);
    return [...existingCarry, ...newCarry];
};

export const FREE_TIER_LIMITS: Record<string, number> = {
    '/api/chat': 20,
    '/api/autonomous-pipeline': 1,
    '/api/generate-plan': 3,
    '/api/generate-quest-steps': 5,
    '/api/analyze-task': 5,
    '/api/generate-subtasks': 5,
    '/api/audio-journal': 2,
    '/api/docs/generate-report': 1,
    '/api/presentations/generate': 1,
};

function localDateStr(d?: Date): string {
    const date = d || new Date();
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

export const checkAIUsage = async (req: any, res: any, next: any) => {
    try {
        await connectDB();
        const userId = req.uid;
        if (!userId) return res.status(401).json({error: 'Unauthorized'});

        const user = await findUserByIdSelect(userId, 'isPremium premiumExpiry');
        if (!user) return res.status(404).json({error: "User not found"});

        const now = new Date();
        const isExpired = user.premiumExpiry && user.premiumExpiry < now;
        if (user.isPremium && !isExpired) return next();

        const endpoint = req.path;
        const today = now.toISOString().split('T')[0];
        const limit = FREE_TIER_LIMITS[endpoint];

        if (!limit) return next();

        // Atomic upsert with $inc — avoids TOCTOU race between count + create
        const counter = await incrementUsageCounter(userId, today, endpoint, now);

        const usageCount = counter.value?.count || 1;

        if (usageCount > limit) {
            // Roll back the increment since we're rejecting
            await decrementUsageCounter(userId, today, endpoint);
            return res.status(403).json({
                error: "Daily free-tier limit reached",
                limit,
                used: usageCount - 1,
                endpoint,
                message: `You've used all ${limit} free AI calls for this feature today. Upgrade to Premium for unlimited access.`
            });
        }

        res.setHeader('X-AI-Usage-Remaining', String(limit - usageCount));
        res.setHeader('X-AI-Usage-Limit', String(limit));
        next();
    } catch (err) {
        console.error("AI usage check error:", err);
        next();
    }
};

export const analyzeTask = async (req: any, res: any) => {
    const {title = '', description = '', deadline = '', model = ''} = req.body || {};
    try {
        const selectedModel = getValidModel(model);
        if (title.length + description.length > MAX_INPUT.analyze) {
            return res.status(413).json({error: "Title and description are too long."});
        }
        const prompt = `
        You are an intelligent productivity assistant. Analyze the following task.
        Task: ${title}
        Description: ${description || 'N/A'}
        Deadline: ${deadline || 'N/A'}
        Current Time: ${new Date().toISOString()}

        Return a JSON response with the following format, with no markdown formatting around it:
        {
          "estimatedHours": <number>,
          "priority": "<high|medium|low>",
          "subtasks": ["subtask 1", "subtask 2", ...],
          "riskScore": <number 0-100, where 100 is highest risk of missing deadline>,
          "confidenceScore": <number 0-100, where 100 is highest confidence in this analysis>
        }
        Be realistic with estimated hours. Break down complex tasks into manageable subtasks.
        Risk Score should be high if the deadline is very close and estimated hours is high.
      `;

        const response = await generateAIContent({model: selectedModel, contents: prompt});
        let text = response.text || "{}";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(text);
        res.json(result);
    } catch (err: any) {
        console.error("Gemini Task Analysis failed, using programmatic fallback:", err);
        const estimatedHours = title.length > 30 ? 5 : 2;
        const priority = (title.toLowerCase().includes("urgent") || title.toLowerCase().includes("asap") || title.toLowerCase().includes("important")) ? "high" : "medium";
        const riskScore = deadline ? 65 : 25;
        res.json({
            estimatedHours, priority,
            subtasks: [
                `Prepare initial resources and outline steps for "${title}"`,
                `Execute main implementation steps`,
                `Perform review and verify deliverables`
            ],
            riskScore, confidenceScore: 85
        });
    }
};

export const generateQuestSteps = async (req: any, res: any) => {
    const {title = '', description = '', targetDate = '', model = ''} = req.body || {};
    try {
        const selectedModel = getValidModel(model);
        if (title.length + description.length > MAX_INPUT.quest) {
            return res.status(413).json({error: "Title and description are too long."});
        }
        const prompt = `
        You are an intelligent productivity assistant. Analyze the following project quest.
        Quest Title: ${title}
        Quest Description: ${description || 'N/A'}
        Target Date: ${targetDate || 'N/A'}
        Current Date/Time: ${new Date().toISOString()}
        
        Decompose this quest into a series of required, actionable, logically sequenced tasks that will lead to its successful completion. Do not limit the tasks to any arbitrary number (like 3 to 6); instead, include all tasks required to fully and thoroughly achieve the quest's goals.
        For each task, provide:
        - "title" (string): A short, active, clear title for the task (e.g., "Research database schemas").
        - "description" (string): A brief explanation of what needs to be done.
        - "deadline" (string): An ISO 8601 datetime string. Distribute the deadlines logically from the current time up to the Quest's target date ("${targetDate || ''}"). If no target date is set, distribute them across the next 14 days. Make sure each deadline falls within standard high-productivity hours (e.g. 09:00 - 12:00, 14:00 - 17:00, or 19:00 - 21:00) and NEVER during routine/rest blocks (like Sleep 23:00 - 08:00, Lunch 12:00 - 13:00, Dinner 19:00 - 20:00, or Workout 18:00 - 19:00), so they never interfere with standard routine blocks of the daily timetable.
        - "priority" (string): "high", "medium", or "low".
        - "estimatedHours" (number): Realistic estimated duration in hours (e.g. 1.5, 3, 8).
        - "riskScore" (number): Risk score from 10 to 95 reflecting complexity or tight timelines.
        - "resources" (array of strings): A list of 1-3 highly relevant URLs, resources, or tutorials to help the user complete this task (use real URLs from your search).

        You MUST return a JSON response exactly in this format, with no markdown, backticks, or text before/after:
        {
          "tasks": [
            {
              "title": "Task 1 Title",
              "description": "Short explanation",
              "deadline": "YYYY-MM-DDTHH:mm:ss.sssZ",
              "priority": "medium",
              "estimatedHours": 2,
              "riskScore": 30,
              "resources": ["https://example.com/guide"]
            }
          ]
        }
      `;

        const response = await generateAIContent({
            model: selectedModel, contents: prompt,
            config: {responseMimeType: "application/json", tools: [{googleSearch: {}}]}
        });
        let text = response.text || "{}";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(text);

        if (result.steps && !result.tasks) {
            const generatedDate = new Date();
            result.tasks = result.steps.map((step: string, index: number) => {
                const deadlineDate = new Date(generatedDate);
                deadlineDate.setDate(deadlineDate.getDate() + (index + 1) * 2);
                return {
                    title: step, description: "",
                    deadline: targetDate ? new Date(targetDate).toISOString() : deadlineDate.toISOString(),
                    priority: "medium", estimatedHours: 2, riskScore: 30
                };
            });
        }
        res.json(result);
    } catch (err: any) {
        console.error("Gemini Quest Steps generation failed, using programmatic fallback:", err);
        const generatedDate = new Date();
        res.json({
            tasks: [
                {
                    title: `Research and requirements analysis for "${title}"`,
                    description: `Identify all core requirements, tech stacks, and preparatory resources needed to complete "${title}".`,
                    deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                    priority: "high",
                    estimatedHours: 2,
                    riskScore: 25,
                    resources: ["https://google.com"]
                },
                {
                    title: `Design and prototype implementation for "${title}"`,
                    description: `Draft schemas, design the layout, and implement the initial basic prototype structure of "${title}".`,
                    deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                    priority: "medium",
                    estimatedHours: 4,
                    riskScore: 40,
                    resources: ["https://github.com"]
                },
                {
                    title: `Build core modules & business logic of "${title}"`,
                    description: `Code key functional modules, integrate APIs, and build the primary architecture for "${title}".`,
                    deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
                    priority: "high",
                    estimatedHours: 8,
                    riskScore: 50,
                    resources: ["https://stackoverflow.com"]
                },
                {
                    title: `Comprehensive testing and polish of "${title}"`,
                    description: `Perform detailed testing, resolve bugs, and polish the final product for deployment.`,
                    deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 12 * 24 * 60 * 60 * 1000).toISOString(),
                    priority: "medium",
                    estimatedHours: 3,
                    riskScore: 30,
                    resources: ["https://web.dev"]
                }
            ]
        });
    }
};

export const generateSubtasks = async (req: any, res: any) => {
    const {title = '', description = '', model = ''} = req.body || {};
    try {
        const selectedModel = getValidModel(model);
        if (title.length + description.length > MAX_INPUT.analyze) {
            return res.status(413).json({error: "Title and description are too long."});
        }
        const prompt = `
        You are an intelligent productivity assistant.
        Analyze the following task and generate a list of 3 to 6 logical, actionable, granular subtasks needed to complete it.
        Task Title: ${title}
        Task Description: ${description || 'N/A'}

        Return a JSON response with the following format, with no markdown, backticks, or text before/after:
        {
          "subtasks": ["subtask 1", "subtask 2", "subtask 3", ...]
        }
        Keep each subtask description short, active, and highly clear (e.g., "Draft the database schema" or "Write unit tests for authentication").
      `;
        const response = await generateAIContent({
            model: selectedModel, contents: prompt,
            config: {responseMimeType: "application/json"}
        });
        let text = response.text || "{}";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(text);
        if (result && Array.isArray(result.subtasks)) return res.json(result);
        throw new Error("Invalid response format");
    } catch (err: any) {
        console.error("Gemini Generate Subtasks Error, using fallback:", err);
        const lowerTitle = title.toLowerCase();
        let fallbackSubtasks = [`Plan and outline the requirements for "${title}"`, `Execute core implementation and setup`, `Verify, test, and complete "${title}"`];
        if (lowerTitle.includes("website") || lowerTitle.includes("app") || lowerTitle.includes("page")) {
            fallbackSubtasks = [`Sketch UI layouts and design mockups`, `Build responsive frontend components`, `Connect state or backend API endpoints`, `Perform end-to-end user experience testing`];
        } else if (lowerTitle.includes("db") || lowerTitle.includes("database") || lowerTitle.includes("sql") || lowerTitle.includes("schema")) {
            fallbackSubtasks = [`Define data relationships and schemas`, `Write migration scripts and initialize database`, `Test database queries and optimize indexes`];
        } else if (lowerTitle.includes("write") || lowerTitle.includes("blog") || lowerTitle.includes("content") || lowerTitle.includes("essay")) {
            fallbackSubtasks = [`Gather references and create a rough outline`, `Draft the main sections and introduction`, `Proofread, format, and publish final draft`];
        }
        res.json({subtasks: fallbackSubtasks, isFallback: true});
    }
};

export const audioJournal = async (req: any, res: any) => {
    try {
        const {text, model} = req.body;
        const selectedModel = getValidModel(model);
        if (!text || typeof text !== 'string' || text.length > MAX_INPUT.journal) {
            return res.status(400).json({error: `Journal text is required and must be under ${MAX_INPUT.journal} characters.`});
        }
        const prompt = `
        You are an intelligent productivity assistant analyzing an audio journal reflection.
        Transcript: "${text}"
        Extract all actionable tasks and provide a short summary.
        Return JSON: { "summary": "Short summary.", "tasks": [{ "title": "Action item", "description": "Context", "priority": "high|medium|low" }] }
      `;
        const response = await generateAIContent({
            model: selectedModel, contents: prompt,
            config: {responseMimeType: "application/json"}
        });
        let outText = response.text || "{}";
        outText = outText.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(outText);

        await connectDB();
        const createdTasks = [];
        if (result.tasks && Array.isArray(result.tasks)) {
            for (const t of result.tasks) {
                const newTask = await createTask({
                    userId: req.uid, title: t.title, description: t.description || "",
                    priority: t.priority || "medium", status: "pending", category: "Journal",
                    estimatedHours: 1, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                });
                createdTasks.push(newTask);
            }
        }
        res.json({summary: result.summary, createdTasks});
    } catch (err: any) {
        console.error(err);
        res.status(500).json({error: "Failed to process audio journal"});
    }
};

export const generatePlan = async (req: any, res: any) => {
    const {tasks = [], date = '', model = ''} = req.body || {};
    try {
        await connectDB();
        const result = await generatePlanLogic({userId: req.uid, tasks, date, model});
        res.json(result);
    } catch (err: any) {
        console.error("Gemini Plan Generation failed:", err);
        res.status(500).json({error: "Failed to schedule tasks. Timetable may be empty."});
    }
};

const buildPlanContext = async (userId: string, tasks: any[], date: string) => {
    await connectDB();
    if (JSON.stringify(tasks).length > MAX_INPUT.plan) {
        throw new Error("Too many tasks. Please reduce the task list.");
    }
    const currentPlan = await findPlanByUserAndDate(userId, date);
    if (!currentPlan || !currentPlan.sessions || currentPlan.sessions.length === 0) {
        throw new Error("No timetable found for today. Please go to Timetable and generate a daily routine first.");
    }

    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);

    let carryForward: CarryForwardEntry[] = [];
    if (yesterdayStr !== date) {
        const yesterdayPlan = await findPlanByUserAndDate(userId, yesterdayStr);
        const yesterdayCarry = (yesterdayPlan as any)?.carryForwardSubtasks || [];
        carryForward = extractCarryForwardSubtasks(yesterdayPlan, yesterdayCarry);
    }

    const goals = await findGoalsByUserUnsorted(userId);
    const questGoalById = new Map<string, any>(
        goals.filter((g: any) => g.type === 'quest').map((g: any) => [g._id.toString(), g])
    );

    const tasksForPrompt = (tasks || []).map((t: any) => {
        const incompleteSubtasks = (t.subtasks || []).filter((st: any) => !st.completed);
        if (incompleteSubtasks.length === 0) return null;
        const quest = t.goalId ? questGoalById.get(String(t.goalId)) : null;
        const schedulingMode = quest ? 'PACED_SUBTASKS' : 'SAME_DAY_SUBTASKS';
        return {
            id: t.id, title: t.title, deadline: t.deadline, priority: t.priority,
            estimatedHours: t.estimatedHours, schedulingMode,
            questTargetDate: quest ? quest.targetDate : undefined,
            subtasks: incompleteSubtasks.map((st: any) => ({id: st.id, title: st.title}))
        };
    }).filter(Boolean);

    const WORK_SLOT_KEYWORDS = ['deep work', 'focus', 'work session', 'study', 'project', 'task', 'block'];
    const workSlotCount = currentPlan.sessions.filter((s: any) => {
        const title = (s.taskTitle || '').toLowerCase();
        return WORK_SLOT_KEYWORDS.some(kw => title.includes(kw)) || (!s.taskTitle || s.taskTitle === 'Untitled');
    }).length;

    const pacedTaskCount = tasksForPrompt.filter((t: any) => t.schedulingMode === 'PACED_SUBTASKS').length;
    const maxPacedPerDay = pacedTaskCount > 0
        ? Math.min(3, Math.max(1, Math.floor(workSlotCount / pacedTaskCount)))
        : 2;

    const prompt = `
        You are an autonomous AI planning assistant.
        Your job is to schedule the user's pending tasks into their EXISTING daily timetable, at SUBTASK granularity.
        Every task has subtasks — schedule subtasks into work slots, never invent subtasks.
        ${carryForward.length > 0 ? `
        CARRY-FORWARD TASKS (HIGH PRIORITY — these subtasks were not completed yesterday. They MUST be given slots today before any new work):
        ${JSON.stringify(carryForward, null, 2)}
        ` : ''}
        Pending Tasks — each one is pre-tagged with a "schedulingMode" you MUST follow exactly:
        ${JSON.stringify(tasksForPrompt, null, 2)}
        
        Current Timetable:
        ${JSON.stringify(currentPlan.sessions, null, 2)}
        
        Available work slots: ${workSlotCount}
        Max subtasks per PACED_SUBTASKS task today: ${maxPacedPerDay}
        
        SCHEDULING MODE DEFINITIONS (mandatory — do not deviate from a task's assigned mode):
        - "SAME_DAY_SUBTASKS": standalone task (not part of a quest). ALL of its incomplete subtasks MUST be scheduled today — distribute them across work slots, sized by how long each subtask likely takes. If you cannot fit all subtasks, schedule NONE of them for this task.
        - "PACED_SUBTASKS": belongs to a long-running quest. Do NOT schedule all subtasks today. Schedule at most ${maxPacedPerDay} subtask(s) for this task today. Spread remaining subtasks across future days. Never front-load.
        
        CRITICAL RULES:
        0. THE TIMETABLE STRUCTURE IS FIXED AND IMMUTABLE. Do NOT change the number of sessions, their start times, or end times.
        1. Identify slots suitable for work (e.g., "Deep Work", "Focus", "Work Session"). Leave non-work slots (Lunch, Workout, Sleep, Routine) exactly as they are.
        2. Never split one subtask across two slots.
        3. ALLOCATION PRIORITY: (a) SAME_DAY_SUBTASKS first (all-or-nothing); (b) PACED_SUBTASKS last (max ${maxPacedPerDay} subtask(s) per task, spread across different quest tasks).
        4. For every assigned work slot:
           - "taskId": set to the parent task's id (must match exactly from the task list above).
           - "taskTitle": MUST be the parent task's EXACT title from the task list above. NEVER use a subtask title, never invent a new title, never shorten or modify it. Example: if the task title is "Build Landing Page", taskTitle must be "Build Landing Page" — NOT "Design Header" (that's a subtask).
           - "subtaskIds": array of subtask id(s) covered in this slot (must match exactly from the subtask list above). This is where subtask information goes — NOT in taskTitle.
        5. For non-work slots (Lunch, Sleep, Workout, Routine), keep existing taskTitle unchanged. Set taskId to "" and subtaskIds to [].
        6. Return the full timetable including untouched non-work slots.

        Return JSON exactly in this format, no markdown:
        {
          "sessions": [
            {
              "taskId": "<exact task id from task list, or empty string for non-work slots>",
              "taskTitle": "<EXACT parent task title from task list — never a subtask title>",
              "subtaskIds": ["<exact subtask id from task list>"],
              "startTime": "YYYY-MM-DDTHH:mm:ss.sss",
              "endTime": "YYYY-MM-DDTHH:mm:ss.sss"
            }
          ]
        }
      `;

    return {currentPlan, carryForward, tasksForPrompt, workSlotCount, maxPacedPerDay, prompt};
};

const callPlanModel = async (context: Awaited<ReturnType<typeof buildPlanContext>>, model: string) => {
    const selectedModel = getValidModel(model);
    const response = await generateAIContent({model: selectedModel, contents: context.prompt});
    let text = response.text || "{}";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
};

const normalizePlanResponse = (result: any, tasks: any[]) => {
    if (!result.sessions || !Array.isArray(result.sessions)) {
        return {
            sessions: [] as any[],
            subtaskTitleById: new Map<string, string>(),
            taskTitleById: new Map<string, string>()
        };
    }
    const sessions = normalizeSessions(result.sessions);
    const subtaskTitleById = new Map<string, string>();
    const taskTitleById = new Map<string, string>();
    for (const t of (tasks || [])) {
        taskTitleById.set(t.id, t.title);
        for (const st of (t.subtasks || [])) {
            subtaskTitleById.set(st.id, st.title);
        }
    }

    for (const s of sessions) {
        if (s.taskId && taskTitleById.has(s.taskId)) {
            const expectedTitle = taskTitleById.get(s.taskId)!;
            if (s.taskTitle !== expectedTitle) {
                console.warn(`[generatePlan] AI returned wrong taskTitle "${s.taskTitle}" for taskId ${s.taskId}, correcting to "${expectedTitle}"`);
                s.taskTitle = expectedTitle;
            }
        }
        if (s.subtaskIds?.length) {
            s.subtaskIds = s.subtaskIds.filter((id: string) => subtaskTitleById.has(id));
        }
    }

    return {sessions, subtaskTitleById, taskTitleById};
};

const validatePlanResponse = (
    normalized: ReturnType<typeof normalizePlanResponse>,
    tasksForPrompt: any[],
    maxPacedPerDay: number
) => {
    const taskMeta = new Map<string, { mode: string; totalIncomplete: number; questTargetDate?: string }>();
    for (const t of tasksForPrompt) {
        taskMeta.set(t.id, {
            mode: t.schedulingMode,
            totalIncomplete: t.subtasks.length,
            questTargetDate: t.questTargetDate
        });
    }

    const scheduledSubtaskCounts = new Map<string, number>();
    const scheduledSubtaskSets = new Map<string, Set<string>>();

    for (const s of normalized.sessions) {
        const meta = taskMeta.get(s.taskId);
        if (!meta) continue;
        if (!scheduledSubtaskCounts.has(s.taskId)) {
            scheduledSubtaskCounts.set(s.taskId, 0);
            scheduledSubtaskSets.set(s.taskId, new Set());
        }
        scheduledSubtaskCounts.set(s.taskId, (scheduledSubtaskCounts.get(s.taskId) || 0) + 1);
        for (const stId of (s.subtaskIds || [])) {
            scheduledSubtaskSets.get(s.taskId)!.add(stId);
        }
    }

    const fixedSessions = normalized.sessions.filter((s: any) => {
        const meta = taskMeta.get(s.taskId);
        if (!meta) return true;

        if (meta.mode === 'PACED_SUBTASKS') {
            const count = scheduledSubtaskCounts.get(s.taskId) || 0;
            if (count > maxPacedPerDay) {
                scheduledSubtaskCounts.set(s.taskId, count - 1);
                return false;
            }
        }
        return true;
    });

    const tasksWithPartialCoverage = new Set<string>();
    for (const [taskId, meta] of taskMeta) {
        if (meta.mode !== 'SAME_DAY_SUBTASKS') continue;
        const covered = scheduledSubtaskSets.get(taskId) || new Set();
        if (covered.size > 0 && covered.size < meta.totalIncomplete) {
            tasksWithPartialCoverage.add(taskId);
        }
    }
    const sessions = fixedSessions.filter((s: any) => !tasksWithPartialCoverage.has(s.taskId));

    const scheduledSubtaskIdsToday = new Set<string>();
    for (const s of sessions) {
        for (const stId of (s.subtaskIds || [])) {
            scheduledSubtaskIdsToday.add(stId);
        }
    }

    const subtaskRegister: { taskId: string; taskTitle: string; scheduled: string[]; unscheduled: string[] }[] = [];
    const unscheduledForCarryForward: CarryForwardEntry[] = [];

    for (const t of tasksForPrompt) {
        if (t.schedulingMode !== 'SAME_DAY_SUBTASKS') continue;
        const scheduled: string[] = [];
        const unscheduled: string[] = [];
        for (const st of t.subtasks) {
            if (scheduledSubtaskIdsToday.has(st.id)) {
                scheduled.push(st.id);
            } else {
                unscheduled.push(st.id);
            }
        }
        if (unscheduled.length > 0) {
            subtaskRegister.push({taskId: t.id, taskTitle: t.title, scheduled, unscheduled});
            unscheduledForCarryForward.push({taskId: t.id, taskTitle: t.title, subtaskIds: unscheduled});
        } else if (scheduled.length > 0) {
            subtaskRegister.push({taskId: t.id, taskTitle: t.title, scheduled, unscheduled: []});
        }
    }

    return {sessions, subtaskRegister, unscheduledForCarryForward};
};

const persistPlan = async (
    userId: string, date: string,
    validated: ReturnType<typeof validatePlanResponse>,
    context: Awaited<ReturnType<typeof buildPlanContext>>,
    subtaskTitleById: Map<string, string>,
    result: any
) => {
    result.subtaskRegister = validated.subtaskRegister;

    if (validated.unscheduledForCarryForward.length > 0) {
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = localDateStr(tomorrow);
        if (tomorrowStr !== date) {
            const tomorrowPlan = await findPlanByUserAndDate(userId, tomorrowStr);
            const existingCarry = (tomorrowPlan as any)?.carryForwardSubtasks || [];
            const mergedCarry = mergeCarryForwardForTomorrow(existingCarry, validated.unscheduledForCarryForward);
            if (mergedCarry.length > existingCarry.length) {
                await upsertPlanCarryForward(userId, tomorrowStr, mergedCarry);
            }
        }
    }

    const existingSessions = context.currentPlan.sessions || [];
    const mergedSessions = existingSessions.map((existing: any) => {
        const existingStart = new Date(existing.startTime).getTime();
        const existingEnd = new Date(existing.endTime).getTime();
        const match = validated.sessions.find((s: any) => {
            return new Date(s.startTime).getTime() === existingStart && new Date(s.endTime).getTime() === existingEnd;
        });
        if (!match) return existing;
        const subtaskIds: string[] = Array.isArray(match.subtaskIds) ? match.subtaskIds.filter((id: any) => subtaskTitleById.has(id)) : [];
        const subtaskTitles = subtaskIds.map((id) => subtaskTitleById.get(id)).filter(Boolean);
        const sessionLabel = subtaskTitles.length > 0 ? subtaskTitles.join(', ') : undefined;
        return {
            ...existing, taskId: match.taskId, taskTitle: match.taskTitle, subtaskIds,
            schedulingMode: context.tasksForPrompt.find((t: any) => t.id === match.taskId)?.schedulingMode || existing.schedulingMode,
            ...(sessionLabel ? {sessionLabel} : {sessionLabel: undefined})
        };
    });
    result.sessions = mergedSessions;
    await upsertPlanSessions(userId, date, mergedSessions);

    return result;
};

export const generatePlanLogic = async ({userId, tasks, date, model}: {
    userId: string; tasks: any[]; date: string; model: string;
}) => {
    const context = await buildPlanContext(userId, tasks, date);
    const raw = await callPlanModel(context, model);
    if (!raw.sessions || !Array.isArray(raw.sessions)) {
        return raw;
    }
    const normalized = normalizePlanResponse(raw, tasks);
    const validated = validatePlanResponse(normalized, context.tasksForPrompt, context.maxPacedPerDay);
    const result = await persistPlan(userId, date, validated, context, normalized.subtaskTitleById, raw);
    return result;
};

export const autonomousPipeline = async (req: any, res: any) => {
    const userId = req.uid;
    const {
        eventName = '',
        eventDetail = '',
        tasks = [],
        model = '',
        dayDescription = '',
        localDateStr: ldStr = '',
        localTimeStr = ''
    } = req.body || {};
    try {
        const selectedModel = getValidModel(model);
        if (JSON.stringify(tasks).length + dayDescription.length > MAX_INPUT.plan) {
            return res.status(413).json({error: "Input too large. Please reduce tasks or description."});
        }
        const prompt = `
        You are an autonomous AI Productivity Agent designing a General Daily Timetable of Total Discipline.
        The timeline MUST be a complete structured routine representing a perfectly disciplined day, covering activities from wake-up to sleeping time.
        
        An event just occurred: "${eventName}"
        Details: "${eventDetail}"
        User's Current Local Time: ${localTimeStr || new Date().toLocaleTimeString()}
        User's Current Local Date: ${ldStr || new Date().toISOString().split('T')[0]}
        
        USER'S DAY DESCRIPTION & PREFERENCES:
        ${dayDescription ? `"${dayDescription}"` : "None specified. Design a classic balanced high-discipline routine."}
        
        Active Quests/Tasks to integrate (use EXACT titles and include taskId + subtaskIds when scheduling them):
        ${JSON.stringify(tasks.map((t: any) => ({
            taskId: t.id,
            title: t.title,
            subtasks: (t.subtasks || []).filter((st: any) => !st.completed).map((st: any) => ({
                id: st.id,
                title: st.title
            })),
            priority: t.priority,
            estimatedHours: t.estimatedHours,
            riskScore: t.riskScore
        })))}
        
        You must formulate a continuous, contiguous schedule spanning the user's entire day (from wake up to sleep). Do not just schedule active tasks. You MUST include general routine sessions to fill the day.
        
        CRITICAL TIME & LABEL ALIGNMENT RULES:
        0. THE TIMETABLE STRUCTURE IS FIXED AND IMMUTABLE. If a day description is provided, follow its structure exactly, including start times, end times, and activity types. You are only permitted to map the provided tasks into the specified slots. Do NOT change or reorder the timetable slots.
        1. Every session MUST be contiguous (no gaps in time where the person has zero structure).
        2. IMPORTANT: Do NOT start scheduling sessions starting from the current clock hour of the request. (For example, if the current time is 11 PM or 2 AM, do NOT discard the morning or afternoon routine). Always generate a full, contiguous 24-hour daily routine representing a perfectly disciplined day starting in the morning (e.g. 05:30 AM or 06:00 AM) of today's date: ${ldStr || new Date().toISOString().split('T')[0]}, all the way to late night (e.g. 10:30 PM or midnight) and sleep.
        3. Adjust the times and activity titles based on the user's day preferences:
           - If they are an early bird, wake up could be 05:00 or 06:00.
           - If they are a night owl or work late, slide the whole timeline so it's realistic for them.
           - Ensure titles match the chronological hours! For example:
             * Morning: Wake Up, Hydrate, Refresh, Breakfast, Morning Focus.
             * Midday: Lunch, Post-Lunch Recharge, Afternoon Focus.
             * Evening: Fitness/Workout, Dinner, Reflection.
             * Night: Wind Down, Evening Planning, Sleep.
             * DO NOT schedule a session titled "Afternoon Review" or "Lunch" at 22:00 (10 PM) or 23:00 (11 PM). Late night slots should be "Night Wind Down", "Offline Reading", "Pre-Sleep Routine", or "Sleep".
        4. When scheduling a task into a deep work block, set "taskId" to the task's id from the list above, "taskTitle" to EXACTLY the task's title from the list (NEVER use a subtask title — subtask info goes in subtaskIds only), and "subtaskIds" to the specific subtask id(s) covered. For routine blocks (meals, exercise, etc.), set taskId to "" and subtaskIds to [].
        5. SCIENCE & HUMAN NATURE CENTRICITY:
           - The timetable MUST be designed in strict harmony with human nature and modern chronobiology to prevent cognitive burnout and ensure it is 100% achievable without hindrance.
           - Avoid creating unrealistic, exhausting back-to-back high-intensity deep work sessions.
           - Integrate 15-30 minute "Biological Buffer Blocks" or "Cognitive Recharge Slots" (e.g., for quiet reflection, physical stretching, hydration, or a brief walk) between deep work blocks.
           - Ensure healthy, natural sleep lengths (7-8 hours).
           - Implement a gradual morning starting ramp-up (rehydration, breathing/light movement, and clear mental planning) rather than a harsh jump straight into intensive tasks.
           - Treat recovery, nutrition (meals), and movement/workout blocks as non-negotiable energy anchors that protect physical and neurological baseline performance.
        
        Return a JSON response exactly in this format (no markdown formatting):
        {
          "decision": {
            "text": "Short explanation of the timetable adjustment",
            "type": "schedule",
            "reason": "Detailed reasoning on how the day is structured for maximum discipline, respecting the user's rhythm"
          },
          "plan": {
            "sessions": [
              {
                "taskId": "<task id from list above, or empty string for routine blocks>",
                "taskTitle": "<EXACT parent task title from list above — never a subtask title>",
                "subtaskIds": ["<subtask id from task's subtask list>"],
                "startTime": "YYYY-MM-DDTHH:mm:ss.sss",
                "endTime": "YYYY-MM-DDTHH:mm:ss.sss"
              }
            ]
          }
        }

        IMPORTANT FORMATTING RULE: You MUST format all 'startTime' and 'endTime' strings as timezone-naive ISO strings using the user's local date/time directly with NO trailing 'Z' and NO offset like '+07:00'. For example, if you want a session to start at 07:30 AM on today's local date ${ldStr || new Date().toISOString().split('T')[0]}, output exactly: "${ldStr || new Date().toISOString().split('T')[0]}T07:30:00.000".
      `;

        const response = await generateAIContent({model: selectedModel, contents: prompt});
        let text = response.text || "{}";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(text);

        if (result.decision) {
            try {
                await connectDB();
                await createAIDecision({
                    userId,
                    title: result.decision.text || result.decision.title || "Schedule Adjustment",
                    reason: result.decision.reason || "A custom timetable was generated and applied directly based on your instructions in the Mission Control Chat.",
                    timestamp: new Date()
                });
            } catch (dbErr) {
                console.warn("Could not save decision:", dbErr);
            }
        }

        const todayDateStr = ldStr || new Date().toISOString().split('T')[0];
        try {
            await connectDB();
            if (result.plan?.sessions?.length > 0) {
                // Build lookup maps for title validation and sessionLabel generation
                const autonomousTaskTitleById = new Map<string, string>();
                const autonomousSubtaskTitleById = new Map<string, string>();
                for (const t of (tasks || [])) {
                    autonomousTaskTitleById.set(t.id, t.title);
                    for (const st of (t.subtasks || [])) {
                        autonomousSubtaskTitleById.set(st.id, st.title);
                    }
                }

                const formattedSessions = normalizeSessions(result.plan.sessions.map((s: any) => ({
                    taskId: s.taskId || "",
                    taskTitle: s.taskTitle,
                    subtaskIds: s.subtaskIds || [],
                    startTime: s.startTime,
                    endTime: s.endTime
                })));

                // Post-AI title validation: correct wrong taskTitles and build sessionLabel
                for (const s of formattedSessions) {
                    if (s.taskId && autonomousTaskTitleById.has(s.taskId)) {
                        const expectedTitle = autonomousTaskTitleById.get(s.taskId)!;
                        if (s.taskTitle !== expectedTitle) {
                            console.warn(`[autonomousPipeline] AI returned wrong taskTitle "${s.taskTitle}" for taskId ${s.taskId}, correcting to "${expectedTitle}"`);
                            s.taskTitle = expectedTitle;
                        }
                    }
                    // Validate subtaskIds exist
                    if (s.subtaskIds?.length) {
                        s.subtaskIds = s.subtaskIds.filter((id: string) => autonomousSubtaskTitleById.has(id));
                    }
                    // Build sessionLabel from subtask titles for card display
                    const subtaskTitles = (s.subtaskIds || []).map((id: string) => autonomousSubtaskTitleById.get(id)).filter(Boolean);
                    if (subtaskTitles.length > 0) {
                        s.sessionLabel = subtaskTitles.join(', ');
                    } else {
                        delete s.sessionLabel;
                    }
                }
                const existingPlan = await findPlanByUserAndDate(userId, todayDateStr);
                if (existingPlan && existingPlan.sessions?.length > 0) {
                    const progressMap = new Map<string, { started: boolean; completed: boolean }>();
                    for (const es of existingPlan.sessions) {
                        if (es.started || es.completed) progressMap.set(`${es.taskTitle}__${es.startTime}`, {
                            started: !!es.started,
                            completed: !!es.completed
                        });
                    }
                    for (const ns of formattedSessions) {
                        const prev = progressMap.get(`${ns.taskTitle}__${ns.startTime}`);
                        if (prev) {
                            ns.started = prev.started;
                            ns.completed = prev.completed;
                        }
                    }
                }
                await upsertPlanSessions(userId, todayDateStr, formattedSessions);
            } else if (tasks.length === 0) {
                await upsertPlanSessions(userId, todayDateStr, []);
            }
        } catch (dbErr) {
            console.warn("Could not save plan:", dbErr);
        }

        res.json(result);
    } catch (err: any) {
        console.error("Gemini Autonomous Pipeline failed, using programmatic fallback:", err);
        const baseDateStr = ldStr || new Date().toISOString().split('T')[0];
        const fallbackSessions = [
            {
                startTime: `${baseDateStr}T06:00:00.000`,
                endTime: `${baseDateStr}T07:00:00.000`,
                taskTitle: "Morning Wake Up & Mindful Grounding"
            },
            {
                startTime: `${baseDateStr}T07:00:00.000`,
                endTime: `${baseDateStr}T08:00:00.000`,
                taskTitle: "Physical Movement & Rehydration"
            },
            {
                startTime: `${baseDateStr}T08:00:00.000`,
                endTime: `${baseDateStr}T09:00:00.000`,
                taskTitle: "Nutritional Energy Anchor (Breakfast) & Daily Focus Planning"
            }
        ];

        const activeTasks = Array.isArray(tasks) ? tasks.filter((t: any) => t.status !== 'completed') : [];
        let currentHour = 9;
        const padTime = (h: number) => String(Math.floor(h)).padStart(2, '0');
        const padMin = (h: number) => (h % 1 === 0.5) ? '30' : '00';

        if (activeTasks.length > 0) {
            activeTasks.slice(0, 3).forEach((task: any) => {
                let startH = currentHour;
                let endH = currentHour + 2;
                if (startH >= 12 && startH < 13) {
                    fallbackSessions.push({
                        startTime: `${baseDateStr}T12:00:00.000`,
                        endTime: `${baseDateStr}T13:00:00.000`,
                        taskTitle: "Lunch & Cognitive Rest Block"
                    });
                    startH = 13;
                    endH = 15;
                    currentHour = 13;
                }
                fallbackSessions.push({
                    startTime: `${baseDateStr}T${padTime(startH)}:${padMin(startH)}:00.000`,
                    endTime: `${baseDateStr}T${padTime(endH)}:${padMin(endH)}:00.000`,
                    taskTitle: `Deep Work Focus: ${task.title}`
                });
                const bufferEndH = endH + 0.5;
                fallbackSessions.push({
                    startTime: `${baseDateStr}T${padTime(endH)}:${padMin(endH)}:00.000`,
                    endTime: `${baseDateStr}T${padTime(bufferEndH)}:${padMin(bufferEndH)}:00.000`,
                    taskTitle: "Biological Buffer & Cognitive Recharge Slot"
                });
                currentHour = endH + 1;
            });
        } else {
            fallbackSessions.push({
                startTime: `${baseDateStr}T09:00:00.000`,
                endTime: `${baseDateStr}T11:00:00.000`,
                taskTitle: "Deep Work Focus Block 1"
            });
            fallbackSessions.push({
                startTime: `${baseDateStr}T11:00:00.000`,
                endTime: `${baseDateStr}T12:00:00.000`,
                taskTitle: "Administrative Sync & Email Clearing"
            });
            fallbackSessions.push({
                startTime: `${baseDateStr}T12:00:00.000`,
                endTime: `${baseDateStr}T13:00:00.000`,
                taskTitle: "Lunch & Cognitive Rest Block"
            });
            fallbackSessions.push({
                startTime: `${baseDateStr}T13:00:00.000`,
                endTime: `${baseDateStr}T15:00:00.000`,
                taskTitle: "Deep Work Focus Block 2"
            });
        }

        fallbackSessions.push({
            startTime: `${baseDateStr}T17:00:00.000`,
            endTime: `${baseDateStr}T18:00:00.000`,
            taskTitle: "Workout & Physical Energy Reset"
        });
        fallbackSessions.push({
            startTime: `${baseDateStr}T19:00:00.000`,
            endTime: `${baseDateStr}T20:00:00.000`,
            taskTitle: "Nutritional Anchor & Dinner"
        });
        fallbackSessions.push({
            startTime: `${baseDateStr}T21:00:00.000`,
            endTime: `${baseDateStr}T22:00:00.000`,
            taskTitle: "Reflection & Wind Down Routine"
        });

        const fallbackDecision = {
            text: `Daily routine scheduled programmatically for maximum efficiency`,
            type: "schedule",
            reason: "Applied offline timetable optimization mapping tasks sequentially with integrated hydration, biological buffer recovery periods, and dietary rhythm blocks."
        };

        try {
            await connectDB();
            await createAIDecision({
                userId,
                title: fallbackDecision.text,
                reason: fallbackDecision.reason,
                timestamp: new Date()
            });
            await upsertPlanSessions(userId, baseDateStr, fallbackSessions.map(s => ({
                taskId: "temp-task-id",
                taskTitle: s.taskTitle,
                startTime: s.startTime,
                endTime: s.endTime
            })));
        } catch (dbErr) {
            console.warn("Could not save fallback plan:", dbErr);
        }
        res.json({decision: fallbackDecision, plan: {sessions: fallbackSessions}});
    }
};

export const chatWithAI = async (req: any, res: any) => {
    try {
        const {messages, context, model, localDateStr: ldStr, localTimeStr} = req.body;
        const selectedModel = getValidModel(model);
        const msgStr = JSON.stringify(messages || []);
        if (msgStr.length > MAX_INPUT.chat) {
            return res.status(413).json({error: "Input too large. Please shorten your messages."});
        }

        await connectDB();
        const user = await findUserById(req.uid);
        const activePersonality = user?.gamification?.activePersonality || 'default';
        let personalityPrompt = "You are TaskPilot AI, an intelligent productivity executive assistant. The user is asking you for help. Respond conversationally, helpfully, and concisely.";
        if (activePersonality === 'drill_sergeant') {
            personalityPrompt = "You are a Strict Drill Sergeant AI. You give tough love, demand excellence, accept absolutely no excuses, and speak in a sharp, motivating, military style.";
        } else if (activePersonality === 'zen_guide') {
            personalityPrompt = "You are a Zen Guide AI. You are calm, mindful, centered, and encourage the user to focus on the present process rather than the stress of outcomes. Speak peacefully and thoughtfully.";
        } else if (activePersonality === 'executive') {
            personalityPrompt = "You are a Hyper-organized Executive Assistant AI. You are highly professional, strictly business-focused, concise, and structured. You speak in bullet points and action-oriented corporate language.";
        }

        const prompt = `
        ${personalityPrompt}
        
        CRITICAL INSTRUCTION: Here is the CURRENT, up-to-date context of their Tasks, Quests, and Habits.
        Even if you said they had no tasks, quests, or habits in the past conversation history, you MUST use this NEW context as the absolute truth for their current state:

        - "tasks" are individual to-do items on their Mission Board.
        - "quests" are larger objectives with a target date, each broken down into a set of linked tasks (tracked via "progress").
        - "habits" are recurring daily commitments tracked via a "streak" count (consecutive days logged).

        Current Context:
        ${JSON.stringify(context, null, 2)}
        
        Conversation History: ${JSON.stringify(messages, null, 2)}
        
        Respond to the user in your designated personality. If they ask about their workload, quests, habits, or what to do next, strictly analyze the CURRENT context provided above. Do not claim their tasks, quests, or habits are empty if the Current Context above contains items.

        TIMETABLE / SCHEDULING CAPABILITY:
        If the user is asking you to generate a schedule, timetable, plan their day, organize sessions, or reschedule today's tasks/activities based on how they tell you they want to manage their time, you MUST:
        1. Formulate a complete daily plan/routine consisting of contiguous sessions from morning (wake up) to night (sleeping).
        2. It MUST represent a highly optimized, science-backed, and human-nature-centric lifestyle that is genuinely achievable without friction or hindrance:
           - NEVER design hyper-rigid, back-to-back high-intensity focus blocks without recovery periods.
           - Include "Biological Buffer Blocks" or "Cognitive Recharge Slots" (15-30 minutes for mindfulness, hydration, or active physical recovery) between strenuous work sessions.
           - Ensure a healthy, natural rest window of 7-8 hours unless explicitly requested otherwise.
           - Keep the morning starting ramp-up gradual (gradual wake-up, physical hydration/stretch, light planning) before heavy cognitive deep work.
           - Actively align tasks to human chronobiology (heavy focus blocks when cognitive capacity peaks, administrative or light tasks during post-lunch energy dips).
        3. In your response, write a friendly, highly motivational text explanation of the schedule in your designated personality, detailing the scientific rationale behind the flow (e.g., circadian alignment, dopamine management, ultradian cycles).
        4. At the very end of your response, append a structured JSON block containing the scheduled sessions. The JSON block MUST be exactly enclosed between '[SET_DAILY_PLAN_START]' and '[SET_DAILY_PLAN_END]'.
        
        The JSON schema within the tags must be exactly:
        {
          "sessions": [
            { "taskTitle": "Task, Routine, or Session Title (e.g. Wake Up & Hydrate, Refreshing Time, Breakfast, Morning Deep Work, Lunch, Fitness Session, Dinner, Sleep)", "startTime": "YYYY-MM-DDTHH:mm:ss.sss", "endTime": "YYYY-MM-DDTHH:mm:ss.sss" }
          ]
        }
        
        Rules for the JSON block:
        - IMPORTANT: Do NOT start scheduling sessions starting from the current clock hour of the request. (For example, if the current time is late at night or mid-day, do NOT discard the morning or afternoon routine).
        - ALWAYS generate a full, contiguous 24-hour daily routine representing a perfectly disciplined day starting in the morning (e.g. 05:30 AM or 06:00 AM) of today's date, all the way to late night (e.g. 10:30 PM or midnight) and sleep.
        - Today's local date is: ${ldStr || new Date().toISOString().split('T')[0]}. The user's current local time is: ${localTimeStr || new Date().toLocaleTimeString()}.
        - IMPORTANT FORMATTING: You MUST format all 'startTime' and 'endTime' strings as timezone-naive ISO strings using the user's local date/time directly with NO trailing 'Z' and NO offset like '+07:00'. For example, if you want a session to start at 07:30 AM on today's local date ${ldStr || new Date().toISOString().split('T')[0]}, output exactly: "${ldStr || new Date().toISOString().split('T')[0]}T07:30:00.000".
        - Ensure JSON is valid and has no backticks, markdown block wrapper, or characters other than the raw JSON string between the start and end tags.
        - Include this plan and JSON block whenever the user wants to set, change, or update their timetable or daily routine structure.
      `;

        const response = await generateAIContent({model: selectedModel, contents: prompt});
        let text = response.text || "";
        let planUpdated = false;

        const startTag = "[SET_DAILY_PLAN_START]";
        const endTag = "[SET_DAILY_PLAN_END]";
        if (text.includes(startTag) && text.includes(endTag)) {
            try {
                const jsonText = text.substring(text.indexOf(startTag) + startTag.length, text.indexOf(endTag)).trim();
                const parsed = JSON.parse(jsonText.replace(/```json/g, "").replace(/```/g, "").trim());
                if (parsed.sessions && Array.isArray(parsed.sessions)) {
                    const todayDateStr = ldStr || new Date().toISOString().split('T')[0];
                    const formattedSessions = normalizeSessions(parsed.sessions.map((s: any) => ({
                        taskId: s.taskId || "temp-task-id",
                        taskTitle: s.taskTitle,
                        startTime: s.startTime,
                        endTime: s.endTime
                    })));
                    await upsertPlanSessions(req.uid, todayDateStr, formattedSessions);
                    await createAIDecision({
                        userId: req.uid,
                        title: "Timetable Generated via Chat",
                        reason: "Custom timetable generated from Mission Control Chat.",
                        timestamp: new Date()
                    });
                    planUpdated = true;
                }
                text = (text.substring(0, text.indexOf(startTag)) + text.substring(text.indexOf(endTag) + endTag.length)).trim();
            } catch (e) {
                console.error("Failed to parse daily plan from chat:", e);
            }
        }

        res.json({text, planUpdated});
    } catch (err: any) {
        console.error("Gemini Chat failed:", err);
        let fallbackText = "Our main neural transmitters are experiencing high traffic (API rate limit). Your local schedule is fully armed and ready. How else can I support you today?";
        try {
            const u = await findUserById(req.uid);
            const p = u?.gamification?.activePersonality || 'default';
            if (p === 'drill_sergeant') fallbackText = "RECRUIT! We've hit a communication static (API Rate Limit). But a true soldier never halts! No excuses! Keep moving forward, stay disciplined, and execute your current daily missions! Drop and give me 20!";
            else if (p === 'zen_guide') fallbackText = "A gentle pause in the stream of thoughts (API Rate Limit). Let us appreciate this quiet, peaceful moment. Your path remains completely clear. Rely on your internal structure, take a deep breath, and move mindfully through your day.";
            else if (p === 'executive') fallbackText = "Status Notification: The communication stream is temporarily experiencing heavy load (API Rate Limit). Operational recommendation: Leverage your pre-scheduled programmatic daily blocks to execute tasks without downtime.";
        } catch (dbErr) {
        }
        res.json({
            text: fallbackText,
            planUpdated: false,
            quotaExceeded: !!err?.isQuotaExceeded,
            quotaModel: err?.quotaModel
        });
    }
};
