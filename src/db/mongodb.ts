import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskpilot';

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
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
  googleId: { type: String, index: true },
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
    earnedBadges: { type: [String], default: [] }
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
  completed: { type: Boolean, default: false },
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
  riskScore: { type: Number },
  confidenceScore: { type: Number },
  subtasks: { type: [SubtaskSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

// 4. ChatMessage Schema
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

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
  endTime: { type: String, required: true }
});

const DailyPlanSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  sessions: { type: [ScheduledSessionSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
});

// Helper to handle compilation with hot reloading/re-importing
export const User = (mongoose.models.User || mongoose.model('User', UserSchema)) as any;
export const Goal = (mongoose.models.Goal || mongoose.model('Goal', GoalSchema)) as any;
export const Task = (mongoose.models.Task || mongoose.model('Task', TaskSchema)) as any;
export const ChatMessage = (mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema)) as any;
export const AIDecision = (mongoose.models.AIDecision || mongoose.model('AIDecision', AIDecisionSchema)) as any;
export const DailyPlanModel = (mongoose.models.DailyPlan || mongoose.model('DailyPlan', DailyPlanSchema)) as any;