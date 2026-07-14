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
  cached = (global as any)._mongooseConn = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set.");
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 })
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
  email: { type: String, required: true, unique: true, index: true },
  // Not required: Google-authenticated users never get a local password.
  password: { type: String },
  name: { type: String, required: true },
  picture: { type: String },
  // 'local' = email/password account, 'google' = signed in via Google OAuth.
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  isGuest: { type: Boolean, default: false },
  googleId: { type: String, index: true },
  googleEmail: { type: String, index: true },
  // Stored so we can refresh Workspace (Calendar/Docs/Sheets) access without
  // re-prompting the user every hour. In a real production deployment this
  // should be encrypted at rest (e.g. via KMS) rather than stored as plain text.
  googleRefreshToken: { type: String },
  address: { type: String, default: '' },
  
  // Gamification Profile
  gamification: {
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: String, default: null }, // YYYY-MM-DD
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalTasksCompleted: { type: Number, default: 0 },
    onTimeTasksCompleted: { type: Number, default: 0 },
    earnedBadges: { type: [String], default: [] },
    unlockedPersonalities: { type: [String], default: ['default'] },
    activePersonality: { type: String, default: 'default' },
    // Focus Zone gamification
    focusStreak: { type: Number, default: 0 },
    longestFocusStreak: { type: Number, default: 0 },
    totalFocusMinutes: { type: Number, default: 0 },
    focusSessionsCompleted: { type: Number, default: 0 },
    focusLastActiveDate: { type: String, default: null } // YYYY-MM-DD — dedicated for focus streak
  },

  createdAt: { type: Date, default: Date.now }
});

// 2. Goal Schema (Quests & Habits)
const GoalStepSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  completed: { type: Boolean, default: false }
});

const GoalSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  targetDate: { type: String },
  type: { type: String, enum: ['habit', 'quest'], required: true },
  progress: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastLogged: { type: String },
  scheduledTime: { type: String },
  completed: { type: Boolean, default: false },
  completedAt: { type: String },
  steps: { type: [GoalStepSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

// 3. Task Schema
const SubtaskSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  completed: { type: Boolean, default: false }
});

const TaskSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  goalId: { type: String, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  deadline: { type: String, default: '' },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
  category: { type: String, default: 'General' },
  estimatedHours: { type: Number, default: 1 },
  hasBeenCompleted: { type: Boolean, default: false },
  completedAt: { type: String },
  riskScore: { type: Number },
  confidenceScore: { type: Number },
  resources: { type: [String], default: [] },
  subtasks: { type: [SubtaskSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

// 4. ChatMessage Schema
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  chatId: { type: String, default: 'default', index: true },
  chatTitle: { type: String, default: 'New Chat' },
  timestamp: { type: Date, default: Date.now }
});

// Compound index: covers the most common query pattern (fetch messages for a
// specific chat, sorted by time).
ChatMessageSchema.index({ userId: 1, chatId: 1, timestamp: 1 });

// 5. AIDecision Schema
const AIDecisionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  reason: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// 6. DailyPlan Schema
const ScheduledSessionSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  taskTitle: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  completed: { type: Boolean, default: false },
  started: { type: Boolean, default: false },
  subtaskIds: { type: [String], default: [] },
  sessionLabel: { type: String },
  schedulingMode: { type: String, enum: ['WHOLE_TASK', 'SAME_DAY_SUBTASKS', 'PACED_SUBTASKS'] }
});

const DailyPlanSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  sessions: { type: [ScheduledSessionSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
});

// Compound unique index: one plan per user per day. Prevents duplicate plans
// from concurrent requests and speeds up the findOne({ userId, date }) pattern
// used on every timetable fetch and save.
DailyPlanSchema.index({ userId: 1, date: 1 }, { unique: true });

// 7. FocusSession Schema
const FocusSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  method: { type: String, enum: ['pomodoro', 'flowtime', '52-17', 'ultradian', 'custom'], required: true },
  taskTitle: { type: String },
  taskId: { type: String },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
  plannedDuration: { type: Number, default: 0 }, // seconds
  actualDuration: { type: Number, required: true }, // seconds
  breaks: { type: Number, default: 0 },
  qualityRating: { type: Number, min: 1, max: 5 },
  note: { type: String },
  completed: { type: Boolean, default: false }
}, { timestamps: true });

FocusSessionSchema.index({ userId: 1, startedAt: -1 });

// Helper to handle compilation with hot reloading/re-importing
export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const Goal = mongoose.models.Goal || mongoose.model('Goal', GoalSchema);
export const Task = mongoose.models.Task || mongoose.model('Task', TaskSchema);
export const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);
export const AIDecision = mongoose.models.AIDecision || mongoose.model('AIDecision', AIDecisionSchema);
export const DailyPlanModel = mongoose.models.DailyPlan || mongoose.model('DailyPlan', DailyPlanSchema);
export const FocusSession = mongoose.models.FocusSession || mongoose.model('FocusSession', FocusSessionSchema);