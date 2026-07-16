import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'taskpilot-ai';

// Cache the connection *promise* (not just a boolean) on the global object.
// This survives warm serverless invocations and, critically, ensures that
// concurrent cold-start requests share a single in-flight connect() call
// instead of racing each other. A failed attempt clears the cached promise
// so the next call retries instead of being permanently stuck.
let cached = (global as any)._mongooseConn;
if (!cached) {
    cached = (global as any)._mongooseConn = {conn: null, promise: null};
}

export const connectDB = async () => {
    if (cached.conn) return cached.conn;

    if (!MONGODB_URI) {
        throw new Error("MONGODB_URI environment variable is not set.");
    }

    if (!cached.promise) {
        cached.promise = mongoose
            .connect(MONGODB_URI, {dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000})
            .then((m) => {
                console.log("Connected to MongoDB successfully");
                return m;
            })
            .catch((error) => {
                // Allow the next call to retry instead of being stuck forever.
                cached.promise = null;
                console.error("MongoDB connection error:", error);
                throw error;
            });
    }

    cached.conn = await cached.promise;
    return cached.conn;
};

// 1. User Schema
const UserSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true},
    // Not required: Google-authenticated users never get a local password.
    password: {type: String},
    name: {type: String, required: true},
    picture: {type: String},
    // 'local' = email/password account, 'google' = signed in via Google OAuth.
    authProvider: {type: String, enum: ['local', 'google'], default: 'local'},
    isGuest: {type: Boolean, default: false},
    googleId: {type: String, unique: true, sparse: true},
    googleEmail: {type: String, unique: true, sparse: true},
    // Stored so we can refresh Workspace (Calendar/Docs/Sheets) access without
    // re-prompting the user every hour. In a real production deployment this
    // should be encrypted at rest (e.g. via KMS) rather than stored as plain text.
    googleRefreshToken: {type: String},
    address: {type: String, default: ''},

    // Password recovery — SHA-256 hash of the raw token (fast O(1) lookup via index)
    passwordResetTokenHash: {type: String, index: true},
    passwordResetExpiry: {type: Date},

    // Session invalidation — bumped on password reset to invalidate all existing JWTs
    tokenVersion: {type: Number, default: 0},
    passwordChangedAt: {type: Date},

    // Login warning — track known IPs and devices
    knownIPs: {type: [String], default: []},
    knownDevices: {type: [String], default: []},

    // Two-Factor Authentication (TOTP)
    twoFactorEnabled: {type: Boolean, default: false},
    twoFactorSecret: {type: String},

    // Role-based access
    role: {type: String, enum: ['user', 'admin'], default: 'user'},

    // Tier system (replaces binary isPremium)
    tier: {type: String, enum: ['free', 'pro', 'pro_plus'], default: 'free'},
    tierExpiry: {type: Date, default: null},

    // Premium Subscription (kept for backward compat)
    isPremium: {type: Boolean, default: false},
    premiumExpiry: {type: Date, default: null},
    subscriptionId: {type: String, default: null},
    subscriptionPlan: {type: String, enum: ['pro_monthly', 'pro_annual', 'pro_plus_monthly', 'pro_plus_annual'], default: null},
    subscriptionActive: {type: Boolean, default: false},
    subscriptions: [{
        plan: {type: String, enum: ['pro_monthly', 'pro_annual', 'pro_plus_monthly', 'pro_plus_annual']},
        amount: {type: Number},
        currency: {type: String, default: 'INR'},
        orderId: {type: String},
        paymentId: {type: String},
        transactionId: {type: String},
        paymentLinkId: {type: String},
        startedAt: {type: Date},
        expiry: {type: Date},
        status: {type: String, enum: ['active', 'pending', 'cancelled', 'expired'], default: 'active'},
        tier: {type: String, enum: ['pro', 'pro_plus']},
        paymentMethod: {type: String, enum: ['razorpay', 'upi'], default: 'razorpay'}
    }],

    // Automation Dial
    automationSettings: {
        global: {type: String, enum: ['suggest', 'auto', 'off'], default: 'suggest'},
        perProject: {type: Map, of: String, default: {}},
    },

    // Velocity Profile (Phase 3.1) — category → actual/estimated ratio
    velocityProfile: {type: Map, of: Number, default: {}},

    // Energy Profile (Phase 2.1) — derived from energy logs, cached
    energyProfile: {
        peakWindows: {type: [String], default: []},
        lowWindows: {type: [String], default: []},
        computedAt: {type: Date, default: null}
    },

    // Gamification Profile
    gamification: {
        currentStreak: {type: Number, default: 0},
        longestStreak: {type: Number, default: 0},
        lastActiveDate: {type: String, default: null}, // YYYY-MM-DD
        xp: {type: Number, default: 0},
        level: {type: Number, default: 1},
        totalTasksCompleted: {type: Number, default: 0},
        onTimeTasksCompleted: {type: Number, default: 0},
        earnedBadges: {type: [String], default: []},
        unlockedPersonalities: {type: [String], default: ['default']},
        activePersonality: {type: String, default: 'default'},
        // Focus Zone gamification
        focusStreak: {type: Number, default: 0},
        longestFocusStreak: {type: Number, default: 0},
        totalFocusMinutes: {type: Number, default: 0},
        focusSessionsCompleted: {type: Number, default: 0},
        focusLastActiveDate: {type: String, default: null},
        // Streak grace days
        streakFreezesAvailable: {type: Number, default: 2},
        streakFreezesUsedDates: {type: [String], default: []}
    },

    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now}
});

UserSchema.pre('save', function (this: any) {
    this.updatedAt = new Date();
});

// 2. Goal Schema (Quests & Habits)
const GoalStepSchema = new mongoose.Schema({
    id: {type: String, required: true},
    title: {type: String, required: true},
    completed: {type: Boolean, default: false}
});

const GoalSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    title: {type: String, required: true},
    description: {type: String, default: ''},
    targetDate: {type: String},
    type: {type: String, enum: ['habit', 'quest'], required: true},
    progress: {type: Number, default: 0},
    streak: {type: Number, default: 0},
    lastLogged: {type: String},
    scheduledTime: {type: String},
    completed: {type: Boolean, default: false},
    completedAt: {type: String},
    steps: {type: [GoalStepSchema], default: []},
    subtasks: {type: [GoalStepSchema], default: []},
    sharedWith: {type: [{userId: String, role: {type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer'}}], default: []},
    targetValue: {type: Number},
    unit: {type: String},
    createdAt: {type: Date, default: Date.now}
});

// 3. Task Schema
const SubtaskSchema = new mongoose.Schema({
    id: {type: String, required: true},
    title: {type: String, required: true},
    completed: {type: Boolean, default: false}
});

const TaskSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    goalId: {type: String, index: true},
    title: {type: String, required: true},
    description: {type: String, default: ''},
    deadline: {type: String, default: ''},
    priority: {type: String, enum: ['high', 'medium', 'low'], default: 'medium'},
    status: {type: String, enum: ['todo', 'pending', 'in_progress', 'completed', 'blocked'], default: 'pending'},
    category: {type: String, default: 'General'},
    estimatedHours: {type: Number, default: 1},
    hasBeenCompleted: {type: Boolean, default: false},
    completedAt: {type: String},
    riskScore: {type: Number},
    riskReason: {type: String},
    confidenceScore: {type: Number},
    resources: {type: [String], default: []},
    subtasks: {type: [SubtaskSchema], default: []},
    microSteps: {type: [SubtaskSchema], default: []},
    schedulingPreference: {type: String},
    // Phase 3.5 — External integration reference (GitHub/Linear/Jira)
    externalRef: {
        provider: {type: String, enum: ['github', 'linear', 'jira'], default: null},
        externalId: {type: String, default: null},
        url: {type: String, default: null}
    },
    createdAt: {type: Date, default: Date.now}
});

// 4. ChatMessage Schema
const ChatMessageSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    role: {type: String, enum: ['user', 'assistant'], required: true},
    content: {type: String, required: true},
    chatId: {type: String, default: 'default', index: true},
    chatTitle: {type: String, default: 'New Chat'},
    timestamp: {type: Date, default: Date.now}
});

// Compound index: covers the most common query pattern (fetch messages for a
// specific chat, sorted by time).
ChatMessageSchema.index({userId: 1, chatId: 1, timestamp: 1});

// 5. AIDecision Schema
const AIDecisionSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    title: {type: String, required: true},
    reason: {type: String, required: true},
    timestamp: {type: Date, default: Date.now}
});

// 6. DailyPlan Schema
const ScheduledSessionSchema = new mongoose.Schema({
    taskId: {type: String, required: true},
    taskTitle: {type: String, required: true},
    startTime: {type: String, required: true},
    endTime: {type: String, required: true},
    completed: {type: Boolean, default: false},
    started: {type: Boolean, default: false},
    subtaskIds: {type: [String], default: []},
    sessionLabel: {type: String},
    schedulingMode: {type: String, enum: ['WHOLE_TASK', 'SAME_DAY_SUBTASKS', 'PACED_SUBTASKS']}
});

const DailyPlanSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true, index: true}, // YYYY-MM-DD
    sessions: {type: [ScheduledSessionSchema], default: []},
    replanRationale: {type: String, default: null},
    updatedAt: {type: Date, default: Date.now}
});

// Compound unique index: one plan per user per day. Prevents duplicate plans
// from concurrent requests and speeds up the findOne({ userId, date }) pattern
// used on every timetable fetch and save.
DailyPlanSchema.index({userId: 1, date: 1}, {unique: true});

// 7. FocusSession Schema
const FocusSessionSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    method: {type: String, enum: ['pomodoro', 'flowtime', '52-17', 'ultradian', 'custom'], required: true},
    taskTitle: {type: String},
    taskId: {type: String},
    startedAt: {type: Date, required: true},
    endedAt: {type: Date, required: true},
    plannedDuration: {type: Number, default: 0}, // seconds
    actualDuration: {type: Number, required: true}, // seconds
    breaks: {type: Number, default: 0},
    qualityRating: {type: Number, min: 1, max: 5},
    note: {type: String},
    completed: {type: Boolean, default: false}
}, {timestamps: true});

FocusSessionSchema.index({userId: 1, startedAt: -1});

// 8. AI Usage Tracking Schema (for free-tier daily limits)
const AIUsageSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true}, // YYYY-MM-DD
    endpoint: {type: String, required: true},
    count: {type: Number, default: 1},
    timestamp: {type: Date, default: Date.now}
});

AIUsageSchema.index({userId: 1, date: 1, endpoint: 1}, {unique: true});
AIUsageSchema.index({timestamp: 1}, {expireAfterSeconds: 86400 * 2}); // Auto-delete after 2 days

// 9. Pricing Configuration Schema (admin-managed)
const PricingConfigSchema = new mongoose.Schema({
    planId: {type: String, required: true, unique: true, index: true},
    name: {type: String, required: true},
    description: {type: String, default: ''},
    basePrice: {type: Number, required: true},
    salePrice: {type: Number, default: null},
    saleActive: {type: Boolean, default: false},
    saleLabel: {type: String, default: ''},
    interval: {type: String, enum: ['month', 'year'], required: true},
    features: {type: [String], default: []},
    popular: {type: Boolean, default: false},
    razorpayPlanId: {type: String, default: null},
    enabled: {type: Boolean, default: true},
    updatedAt: {type: Date, default: Date.now}
});

PricingConfigSchema.index({enabled: 1});

// 10. AI Action Schema (Automation Dial explainability + undo trail)
const AIActionSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    type: {type: String, required: true}, // 'reschedule' | 'priority_change' | 'task_created' | 'subtask_created' | 'micro_steps'
    targetId: {type: String, required: true},
    targetCollection: {type: String, required: true},
    before: {type: mongoose.Schema.Types.Mixed},
    after: {type: mongoose.Schema.Types.Mixed},
    reason: {type: String, required: true},
    status: {type: String, enum: ['applied', 'pending_review', 'accepted', 'rejected', 'reverted'], default: 'applied'},
    createdAt: {type: Date, default: Date.now, index: true}
});

AIActionSchema.index({userId: 1, status: 1, createdAt: -1});

// 11. Dopamine Menu Schema
const DopamineMenuItemSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    label: {type: String, required: true},
    emoji: {type: String, default: '?'},
    durationMinutes: {type: Number, default: 5}
});

// 12. Personal Access Token Schema (for browser extension auth)
const PersonalAccessTokenSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    name: {type: String, required: true},
    tokenHash: {type: String, required: true, index: true},
    lastUsedAt: {type: Date},
    expiresAt: {type: Date, default: null},
    createdAt: {type: Date, default: Date.now}
});

// 13. Burnout Signal Schema
const BurnoutSignalSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true}, // YYYY-MM-DD
    triggers: {type: [String], default: []},
    severity: {type: String, enum: ['low', 'medium', 'high'], default: 'low'},
    dismissed: {type: Boolean, default: false}
});

BurnoutSignalSchema.index({userId: 1, date: 1}, {unique: true});

// 14. Energy Log Schema
const EnergyLogSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true}, // YYYY-MM-DD
    timeOfDay: {type: String, enum: ['morning', 'afternoon', 'evening', 'night'], required: true},
    energyLevel: {type: Number, min: 1, max: 5, required: true},
    source: {type: String, enum: ['manual', 'inferred'], default: 'manual'}
});

EnergyLogSchema.index({userId: 1, date: 1});

// 15. Knowledge Graph Schemas (Phase 3.2)
const KnowledgeEntitySchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    type: {type: String, enum: ['person', 'project', 'file', 'topic'], required: true},
    name: {type: String, required: true},
    aliases: {type: [String], default: []}
});

KnowledgeEntitySchema.index({userId: 1, name: 'text', aliases: 'text'});
KnowledgeEntitySchema.index({userId: 1, type: 1});

const KnowledgeEdgeSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    fromEntityId: {type: String, required: true},
    toEntityId: {type: String, required: true},
    relation: {type: String, required: true},
    sourceType: {type: String, enum: ['task', 'chat', 'meeting', 'email'], required: true},
    sourceId: {type: String, default: null},
    extractedAt: {type: Date, default: Date.now}
});

KnowledgeEdgeSchema.index({userId: 1, fromEntityId: 1});
KnowledgeEdgeSchema.index({userId: 1, toEntityId: 1});

// 16. Integration Connection Schema (Phase 3.5)
const IntegrationConnectionSchema = new mongoose.Schema({
    userId: {type: String, required: true, index: true},
    provider: {type: String, enum: ['github', 'linear', 'jira'], required: true},
    accessToken: {type: String, required: true}, // encrypted
    refreshToken: {type: String, default: null},
    externalAccountId: {type: String, default: null},
    externalAccountName: {type: String, default: null},
    createdAt: {type: Date, default: Date.now},
    lastSyncedAt: {type: Date, default: null}
});

IntegrationConnectionSchema.index({userId: 1, provider: 1}, {unique: true});

// Helper to handle compilation with hot reloading/re-importing
export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const Goal = mongoose.models.Goal || mongoose.model('Goal', GoalSchema);
export const Task = mongoose.models.Task || mongoose.model('Task', TaskSchema);
export const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);
export const AIDecision = mongoose.models.AIDecision || mongoose.model('AIDecision', AIDecisionSchema);
export const DailyPlanModel = mongoose.models.DailyPlan || mongoose.model('DailyPlan', DailyPlanSchema);
export const FocusSession = mongoose.models.FocusSession || mongoose.model('FocusSession', FocusSessionSchema);
export const AIUsage = mongoose.models.AIUsage || mongoose.model('AIUsage', AIUsageSchema);
export const PricingConfig = mongoose.models.PricingConfig || mongoose.model('PricingConfig', PricingConfigSchema);
export const AIAction = mongoose.models.AIAction || mongoose.model('AIAction', AIActionSchema);
export const DopamineMenuItem = mongoose.models.DopamineMenuItem || mongoose.model('DopamineMenuItem', DopamineMenuItemSchema);
export const PersonalAccessToken = mongoose.models.PersonalAccessToken || mongoose.model('PersonalAccessToken', PersonalAccessTokenSchema);
export const BurnoutSignal = mongoose.models.BurnoutSignal || mongoose.model('BurnoutSignal', BurnoutSignalSchema);
export const EnergyLog = mongoose.models.EnergyLog || mongoose.model('EnergyLog', EnergyLogSchema);
export const KnowledgeEntity = mongoose.models.KnowledgeEntity || mongoose.model('KnowledgeEntity', KnowledgeEntitySchema);
export const KnowledgeEdge = mongoose.models.KnowledgeEdge || mongoose.model('KnowledgeEdge', KnowledgeEdgeSchema);
export const IntegrationConnection = mongoose.models.IntegrationConnection || mongoose.model('IntegrationConnection', IntegrationConnectionSchema);