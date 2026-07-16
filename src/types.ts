export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

export interface Task {
    id: string;
    userId: string;
    title: string;
    description: string;
    deadline: string; // ISO date string
    priority: Priority;
    status: TaskStatus;
    category: string;
    estimatedHours: number;
    subtasks: Subtask[];
    createdAt: string;
    riskScore?: number;
    confidenceScore?: number;
    resources?: string[];
    goalId?: string | null;
    completedAt?: string;
    hasBeenCompleted?: boolean;
    schedulingPreference?: string;
}

export interface ScheduledSession {
    taskId: string;
    taskTitle: string;  // parent task title — kept stable for matching against Task.title elsewhere
    startTime: string; // ISO datetime
    endTime: string;   // ISO datetime
    completed?: boolean;
    started?: boolean;
    // Subtask-level scheduling: which specific subtask(s) of the parent task this session
    // covers, and a display label showing just the deepest scheduled level's name — the
    // subtask name(s) alone (e.g. "Subtask A, Subtask B") when subtasks are scheduled, with
    // no parent task/quest name concatenated in. When absent, the UI falls back to
    // `taskTitle` (the task's own name, whether or not it belongs to a quest). Both fields
    // are optional/absent for non-task routine slots (Lunch, Sleep, etc.) and for legacy
    // sessions generated before subtask-aware scheduling existed.
    subtaskIds?: string[];
    sessionLabel?: string;
    schedulingMode?: 'SAME_DAY_SUBTASKS' | 'PACED_SUBTASKS';
}

export interface DailyPlan {
    id: string;
    userId: string;
    date: string; // YYYY-MM-DD
    sessions: ScheduledSession[];
    updatedAt?: string;
}

export interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    photoURL?: string;
    gamification?: GamificationState;
}

export interface GamificationState {
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string | null;
    xp: number;
    level: number;
    totalTasksCompleted: number;
    onTimeTasksCompleted: number;
    earnedBadges: string[];
    unlockedPersonalities?: string[];
    activePersonality?: string;
    // Focus Zone gamification
    focusStreak?: number;
    longestFocusStreak?: number;
    totalFocusMinutes?: number;
    focusSessionsCompleted?: number;
    focusLastActiveDate?: string | null;
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    category: 'Streak' | 'Productivity' | 'Quality' | 'AI';
    criteria: number;
}

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'streak_3',
        name: 'Getting Started',
        description: '3-day streak',
        icon: 'Flame',
        tier: 'Common',
        category: 'Streak',
        criteria: 3
    },
    {
        id: 'streak_7',
        name: 'Week Warrior',
        description: '7-day streak',
        icon: 'Flame',
        tier: 'Rare',
        category: 'Streak',
        criteria: 7
    },
    {
        id: 'streak_30',
        name: 'Monthly Master',
        description: '30-day streak',
        icon: 'Flame',
        tier: 'Epic',
        category: 'Streak',
        criteria: 30
    },
    {
        id: 'streak_100',
        name: 'Centurion',
        description: '100-day streak',
        icon: 'Flame',
        tier: 'Legendary',
        category: 'Streak',
        criteria: 100
    },
    {
        id: 'tasks_50',
        name: 'Task Master',
        description: '50 tasks completed',
        icon: 'CheckCircle',
        tier: 'Rare',
        category: 'Productivity',
        criteria: 50
    },
    {
        id: 'tasks_500',
        name: 'Productivity Legend',
        description: '500 tasks completed',
        icon: 'CheckCircle',
        tier: 'Legendary',
        category: 'Productivity',
        criteria: 500
    },
    {
        id: 'punctual_10',
        name: 'Punctual Planner',
        description: '10 tasks on time',
        icon: 'Clock',
        tier: 'Common',
        category: 'Quality',
        criteria: 10
    },
    {
        id: 'deadline_50',
        name: 'Deadline Master',
        description: '50 tasks on time',
        icon: 'Clock',
        tier: 'Epic',
        category: 'Quality',
        criteria: 50
    },
    // Focus Zone badges
    {
        id: 'focus_3',
        name: 'Focused Starter',
        description: '3-day focus streak',
        icon: 'Headphones',
        tier: 'Common',
        category: 'Streak',
        criteria: 3
    },
    {
        id: 'focus_7',
        name: 'Deep Diver',
        description: '7-day focus streak',
        icon: 'Headphones',
        tier: 'Rare',
        category: 'Streak',
        criteria: 7
    },
    {
        id: 'focus_30',
        name: 'Flow Master',
        description: '30-day focus streak',
        icon: 'Headphones',
        tier: 'Epic',
        category: 'Streak',
        criteria: 30
    },
    {
        id: 'focus_100',
        name: 'Zen Focus Legend',
        description: '100-day focus streak',
        icon: 'Headphones',
        tier: 'Legendary',
        category: 'Streak',
        criteria: 100
    },
    {
        id: 'focus_10_sessions',
        name: 'Focus Beginner',
        description: '10 focus sessions',
        icon: 'Headphones',
        tier: 'Common',
        category: 'Productivity',
        criteria: 10
    },
    {
        id: 'focus_50_sessions',
        name: 'Focus Regular',
        description: '50 focus sessions',
        icon: 'Headphones',
        tier: 'Rare',
        category: 'Productivity',
        criteria: 50
    },
    {
        id: 'focus_100_sessions',
        name: 'Focus Obsessed',
        description: '100 focus sessions',
        icon: 'Headphones',
        tier: 'Epic',
        category: 'Productivity',
        criteria: 100
    },
    {
        id: 'focus_10_hours',
        name: 'Time Invested',
        description: '10 hours of focus',
        icon: 'Clock',
        tier: 'Common',
        category: 'Quality',
        criteria: 10
    },
    {
        id: 'focus_100_hours',
        name: 'Focus Marathoner',
        description: '100 hours of focus',
        icon: 'Clock',
        tier: 'Legendary',
        category: 'Quality',
        criteria: 100
    },
];

export interface AIDecision {
    id: string;
    timestamp: string;
    title: string;
    reason: string;
}

export interface GoalStep {
    id: string;
    title: string;
    completed: boolean;
}

export interface Goal {
    id: string;
    userId: string;
    title: string;
    description: string;
    targetDate?: string; // ISO string for quests
    type: 'habit' | 'quest';
    progress: number; // 0-100 for quest, or completion count for habits
    streak?: number; // for habits
    lastLogged?: string; // ISO date string for habits
    scheduledTime?: string; // "HH:MM" for time-based habits
    steps?: GoalStep[];
    subtasks?: GoalStep[];
    targetValue?: number;
    unit?: string;
    completed: boolean;
    completedAt?: string;
    createdAt: string;
}

// ─── Focus Zone ──────────────────────────────────────────────────────────────

export type FocusMethod = 'pomodoro' | 'flowtime' | '52-17' | 'ultradian' | 'custom';

export interface FocusSession {
    id: string;
    _id?: string; // MongoDB document ID
    userId: string;
    method: FocusMethod;
    taskTitle?: string;
    taskId?: string;
    startedAt: string;   // ISO datetime
    endedAt: string;     // ISO datetime
    plannedDuration: number; // seconds (0 for flowtime)
    actualDuration: number;  // seconds
    breaks: number;
    qualityRating?: number;  // 1-5
    note?: string;
    completed: boolean;      // finished naturally vs stopped early
}

export interface FocusStats {
    todayMinutes: number;
    todaySessions: number;
    weekMinutes: number;
    weekSessions: number;
    monthMinutes: number;
    monthSessions: number;
    focusStreak: number;
    longestFocusStreak: number;
    totalFocusMinutes: number;
    totalFocusSessions: number;
    byMethod: Record<FocusMethod, number>; // total minutes per method
    heatmap: Record<string, number>;       // YYYY-MM-DD → minutes
    dailyWeek: Record<string, number>;     // Mon-Sun label → minutes (this week)
}

// ─── Premium Subscription ────────────────────────────────────────────────────

export interface SubscriptionPlan {
    id: string;
    name: string;
    description: string;
    price: number; // in INR
    interval: 'month' | 'year';
    features: string[];
    popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
    {
        id: 'monthly',
        name: 'Monthly Premium',
        description: 'Access to all premium features for one month',
        price: 199,
        interval: 'month',
        features: [
            'Unlimited AI Power Mode sessions',
            'Advanced analytics dashboard',
            'Priority AI processing',
            'No watermarks on exports',
            'Premium themes & customization',
            'Export to PDF reports'
        ]
    },
    {
        id: 'annual',
        name: 'Annual Premium',
        description: 'Save 20% with annual billing',
        price: 1999,
        interval: 'year',
        features: [
            'All Monthly Premium features',
            'All for the price of 8 months',
            'Early access to new features',
            'Premium support priority'
        ],
        popular: true
    }
];

export const PREMIUM_FEATURES = [
    'unlimited_sessions',
    'advanced_analytics',
    'priority_processing',
    'no_watermarks',
    'premium_themes',
    'pdf_exports',
    'power_mode',
    'scheduled_reports',
    'collaboration',
    'custom_domains'
] as const;

export type PremiumFeature = typeof PREMIUM_FEATURES[number];