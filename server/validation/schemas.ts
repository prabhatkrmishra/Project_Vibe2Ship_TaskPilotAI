import {z} from "zod";

const priorityEnum = z.enum(['high', 'medium', 'low']);
const statusEnum = z.enum(['todo', 'pending', 'in_progress', 'completed', 'blocked']);
const goalTypeEnum = z.enum(['habit', 'quest']);

const subtaskSchema = z.object({
    id: z.string(),
    title: z.string().max(500),
    completed: z.boolean().optional(),
});

export const createTaskSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional().default(''),
    priority: priorityEnum.optional().default('medium'),
    status: statusEnum.optional().default('pending'),
    deadline: z.string().optional().default(''),
    estimatedHours: z.number().min(0).max(1000).optional(),
    goalId: z.string().optional(),
    subtasks: z.array(subtaskSchema).max(50).optional(),
    schedulingPreference: z.string().optional(),
});

export const updateTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    priority: priorityEnum.optional(),
    status: statusEnum.optional(),
    deadline: z.string().optional(),
    estimatedHours: z.number().min(0).max(1000).optional(),
    goalId: z.string().nullable().optional(),
    subtasks: z.array(subtaskSchema).max(50).optional(),
    schedulingPreference: z.string().optional(),
    hasBeenCompleted: z.boolean().optional(),
});

export const createGoalSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional().default(''),
    type: goalTypeEnum.optional().default('habit'),
    targetDate: z.string().optional(),
    targetValue: z.number().optional(),
    unit: z.string().max(50).optional(),
    subtasks: z.array(subtaskSchema).max(50).optional(),
});

export const updateGoalSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    type: goalTypeEnum.optional(),
    targetDate: z.string().optional(),
    targetValue: z.number().optional(),
    unit: z.string().max(50).optional(),
    subtasks: z.array(subtaskSchema).max(50).optional(),
    completed: z.boolean().optional(),
});

export const registerSchema = z.object({
    email: z.string().min(1, "Email is required").email("Invalid email format"),
    password: z.string().min(8, "Password must be 8-128 characters").max(128, "Password must be 8-128 characters"),
    name: z.string().min(1, "Name is required"),
    address: z.string().optional(),
});

export const loginSchema = z.object({
    email: z.string().min(1, "Email is required"),
    password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be 8-128 characters").max(128, "Password must be 8-128 characters"),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token is required"),
    newPassword: z.string().min(8, "Password must be 8-128 characters").max(128, "Password must be 8-128 characters"),
});

export const createChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1, "Content is required").max(50000, "Content must be under 50,000 characters"),
    chatId: z.string().max(100).optional(),
    chatTitle: z.string().max(200).optional(),
});

export const renameChatSessionSchema = z.object({
    title: z.string().min(1, "Title is required"),
});

export const createCalendarEventSchema = z.object({
    summary: z.string().min(1, "Event summary is required").max(500),
    description: z.string().max(5000).optional(),
    start: z.any().optional(),
    end: z.any().optional(),
    location: z.string().max(500).optional(),
    reminders: z.any().optional(),
});

const focusMethodEnum = z.enum(["pomodoro", "flowtime", "52-17", "ultradian", "custom"]);

export const createFocusSessionSchema = z.object({
    method: focusMethodEnum,
    taskTitle: z.string().optional(),
    taskId: z.string().optional(),
    startedAt: z.string().min(1, "startedAt is required"),
    endedAt: z.string().min(1, "endedAt is required"),
    plannedDuration: z.number().min(0).optional().default(0),
    actualDuration: z.number().positive("actualDuration must be a positive number").max(43200, "actualDuration exceeds maximum (12 hours)"),
    breaks: z.number().min(0).optional().default(0),
    qualityRating: z.number().min(1).max(5).optional(),
    note: z.string().optional(),
    completed: z.boolean().optional().default(true),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;
export type RenameChatSessionInput = z.infer<typeof renameChatSessionSchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type CreateFocusSessionInput = z.infer<typeof createFocusSessionSchema>;
