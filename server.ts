import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import * as fs from 'fs';
import * as crypto from 'crypto';
import { OAuth2Client } from "google-auth-library";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import { connectDB, User as UserSrc, Goal as GoalSrc, Task as TaskSrc, ChatMessage as ChatMessageSrc, AIDecision as AIDecisionSrc, DailyPlanModel as DailyPlanModelSrc } from "./src/db/mongodb";

const User = UserSrc as any;
const Goal = GoalSrc as any;
const Task = TaskSrc as any;
const ChatMessage = ChatMessageSrc as any;
const AIDecision = AIDecisionSrc as any;
const DailyPlanModel = DailyPlanModelSrc as any;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length === 0) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Refusing to start with an insecure default secret. " +
    "Set JWT_SECRET to a long, random value (e.g. `openssl rand -hex 32`)."
  );
}
const JWT_SECRET = process.env.JWT_SECRET;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function getValidModel(modelName: string | undefined): string {
  let model = modelName || "gemini-3.5-flash";
  // Strip "models/" if present
  model = model.replace(/^models\//, "");
  // If it's a deprecated/prohibited model, map it to gemini-3.5-flash
  if (
    model.includes("gemini-2.0-flash") ||
    model.includes("gemini-1.5") ||
    model === "gemini-pro"
  ) {
    return "gemini-3.5-flash";
  }
  return model;
}

async function generateContentWithRetry(params: {
  model: string;
  contents: any;
  config?: any;
}): Promise<any> {
  const maxRetries = 2;
  let delay = 1000;
  let attempt = 0;
  let currentModel = params.model;

  while (true) {
    try {
      return await ai.models.generateContent({
        model: currentModel,
        contents: params.contents,
        config: params.config,
      });
    } catch (err: any) {
      attempt++;
      const isQuotaError = 
        err.status === "RESOURCE_EXHAUSTED" ||
        err.statusCode === 429 ||
        (err.message && (
          err.message.includes("429") ||
          err.message.includes("quota") ||
          err.message.includes("limit") ||
          err.message.includes("RESOURCE_EXHAUSTED") ||
          err.message.includes("Quota") ||
          err.message.includes("exhausted")
        ));

      if (isQuotaError) {
        console.warn(`[Gemini API] Quota limit exceeded for model ${currentModel} (attempt ${attempt}).`);
        if (attempt <= maxRetries) {
          console.log(`[Gemini API] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        } else {
          const hasModelsPrefix = currentModel.startsWith("models/");
          const fallbackBase = "gemini-3.1-flash-lite";
          const fallbackModel = hasModelsPrefix ? `models/${fallbackBase}` : fallbackBase;
          
          if (currentModel !== fallbackModel) {
            console.warn(`[Gemini API] Switching fallback from ${currentModel} to ${fallbackModel}...`);
            currentModel = fallbackModel;
            attempt = 0; // Reset attempts for fallback
            delay = 1000;
            continue;
          }
        }
      }
      throw err;
    }
  }
}

// AI-generated sessions sometimes cross midnight (e.g. "Sleep 23:30 - 06:30") but the model
// stamps both startTime and endTime with the same calendar date, which makes endTime < startTime.
// That breaks every duration-based calculation on the client (isActive, isPast, progress, and the
// Start/Mark Complete buttons). This normalizes any such session by rolling endTime forward one day,
// and drops any session that is still malformed (missing/unparseable/zero-length) or fully duplicated.
function normalizeSessions(sessions: any[]): any[] {
  if (!Array.isArray(sessions)) return [];

  const normalized = sessions
    .map((s) => {
      if (!s || !s.startTime || !s.endTime) return null;
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

      let endTime = s.endTime;
      if (end.getTime() <= start.getTime()) {
        // Roll the calendar date portion of the naive ISO string forward by one day while
        // keeping the wall-clock time-of-day untouched. Using Date math + toISOString() here
        // would re-interpret/convert through the server process's timezone and can silently
        // shift the stored time if the server isn't running in UTC.
        const match = endTime.match(/^(\d{4})-(\d{2})-(\d{2})T(.*)$/);
        if (!match) return null;
        const [, y, m, d, rest] = match;
        const rolled = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
        const rolledDateStr = rolled.toISOString().split('T')[0];
        endTime = `${rolledDateStr}T${rest}`;

        // Guard against still-invalid ranges (e.g. identical start/end).
        if (new Date(endTime).getTime() <= start.getTime()) return null;
      }

      return { ...s, endTime };
    })
    .filter((s): s is any => s !== null);

  normalized.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return normalized;
}

async function startServer() {
  const app = express();
  // Cloud Run terminates TLS at its load balancer and forwards plain HTTP
  // internally, setting X-Forwarded-Proto. Without this, req.protocol would
  // always report "http", breaking the origin allowlist check below.
  app.set('trust proxy', true);
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---
  
  // Connect to MongoDB on server start (non-blocking to prevent server startup timeouts)
  connectDB().catch(err => {
    console.error("Failed to connect to MongoDB on startup:", err);
  });

  const verifyToken = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.uid = decoded.uid;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  async function processGamificationOnTaskComplete(userId: string, task: any) {
    try {
      const user = await User.findOne({ _id: userId });
      if (!user) return null;
      
      let gamification = user.gamification || {
        currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
      };
      
      const today = new Date().toISOString().split('T')[0];
      
      if (gamification.lastActiveDate !== today) {
        if (gamification.lastActiveDate) {
          const lastActive = new Date(gamification.lastActiveDate);
          const todayDate = new Date(today);
          const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            gamification.currentStreak += 1;
          } else {
            gamification.currentStreak = 1;
          }
        } else {
          gamification.currentStreak = 1;
        }
        gamification.lastActiveDate = today;
      }
      
      if (gamification.currentStreak > gamification.longestStreak) {
        gamification.longestStreak = gamification.currentStreak;
      }
      
      gamification.totalTasksCompleted += 1;
      
      const isOnTime = !task.deadline || new Date(task.deadline) >= new Date();
      if (isOnTime) {
        gamification.onTimeTasksCompleted += 1;
      }
      
      const xpEarned = isOnTime ? 50 : 25;
      gamification.xp += xpEarned;
      
      const nextLevelXP = gamification.level * 200;
      let levelUp = null;
      if (gamification.xp >= nextLevelXP) {
        gamification.level += 1;
        levelUp = gamification.level;
      }
      
      const newBadges: string[] = [];
      const checkBadge = (id: string, condition: boolean) => {
        if (condition && !gamification.earnedBadges.includes(id)) {
          gamification.earnedBadges.push(id);
          newBadges.push(id);
        }
      };
      
      checkBadge('streak_3', gamification.currentStreak >= 3);
      checkBadge('streak_7', gamification.currentStreak >= 7);
      checkBadge('streak_30', gamification.currentStreak >= 30);
      checkBadge('streak_100', gamification.currentStreak >= 100);
      
      checkBadge('tasks_50', gamification.totalTasksCompleted >= 50);
      checkBadge('tasks_500', gamification.totalTasksCompleted >= 500);
      
      checkBadge('punctual_10', gamification.onTimeTasksCompleted >= 10);
      checkBadge('deadline_50', gamification.onTimeTasksCompleted >= 50);
      
      user.gamification = gamification;
      await user.save();
      
      return { xpEarned, newBadges, levelUp };
    } catch(e) {
      console.error("Gamification error:", e);
      return null;
    }
  }
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- MongoDB Authentication Endpoints ---

  app.post(["/register/user", "/api/register/user", "/api/auth/register"], async (req, res) => {
    try {
      const { email, password, name, address } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: "Please provide email, password, and name" });
      }
      await connectDB();
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        address: address || "",
        picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`
      });
      const token = jwt.sign({ uid: newUser._id.toString(), email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });
      res.json({
        token,
        user: {
          uid: newUser._id.toString(),
          email: newUser.email,
          name: newUser.name,
          picture: newUser.picture,
          address: newUser.address,
          gamification: getCorrectedGamification(newUser.gamification)
        }
      });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Please provide email and password" });
      }
      await connectDB();
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !user.password) {
        // Same generic error whether the account doesn't exist or is a
        // Google-only account with no password set, so we don't leak
        // which case it is.
        return res.status(400).json({ error: "Invalid email or password" });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Invalid email or password" });
      }
      const token = jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });
      res.json({
        token,
        user: {
          uid: user._id.toString(),
          email: user.email,
          name: user.name,
          picture: user.picture,
          address: user.address || "",
          gamification: getCorrectedGamification(user.gamification)
        }
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/guest", async (req, res) => {
    try {
      await connectDB();
      // Each guest session gets its own isolated account so guests never
      // share (or can see/edit/delete) each other's tasks, goals, chats, etc.
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
      const guestEmail = `guest-${uniqueSuffix}@taskpilot.ai`;
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      const guest = await User.create({
        email: guestEmail,
        password: hashedPassword,
        name: "Guest Pilot",
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest",
        address: "123 Pilot Way, AI Station",
        isGuest: true
      });
      const token = jwt.sign({ uid: guest._id.toString(), email: guest.email }, JWT_SECRET, { expiresIn: '30d' });
      res.json({
        token,
        user: {
          uid: guest._id.toString(),
          email: guest.email,
          name: guest.name,
          picture: guest.picture,
          address: guest.address || "",
          gamification: getCorrectedGamification(guest.gamification)
        }
      });
    } catch (error: any) {
      console.error("Guest error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  function getCorrectedGamification(gamificationObj: any) {
    if (!gamificationObj) return gamificationObj;
    
    // Convert to plain object if it's a mongoose document
    const gamification = gamificationObj.toObject ? gamificationObj.toObject() : { ...gamificationObj };
    
    const today = new Date().toISOString().split('T')[0];
    if (gamification.lastActiveDate && gamification.lastActiveDate !== today) {
      const lastActive = new Date(gamification.lastActiveDate);
      const todayDate = new Date(today);
      const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        gamification.currentStreak = 0;
      }
    }
    return gamification;
  }

  app.get("/api/auth/me", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        uid: user._id.toString(),
        email: user.email,
        name: user.name,
        picture: user.picture,
        address: user.address || "",
        gamification: getCorrectedGamification(user.gamification) || {
          currentStreak: 0, longestStreak: 0, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [], unlockedPersonalities: ['default'], activePersonality: 'default'
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/user/personalities/unlock", verifyToken, async (req: any, res: any) => {
    try {
      const { personalityId, cost } = req.body;
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!user.gamification) {
        user.gamification = { currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [], unlockedPersonalities: ['default'], activePersonality: 'default' } as any;
      }
      if (!user.gamification.unlockedPersonalities) {
        user.gamification.unlockedPersonalities = ['default'];
      }

      if (user.gamification.xp < cost) {
        return res.status(400).json({ error: "Not enough XP" });
      }
      if (user.gamification.unlockedPersonalities.includes(personalityId)) {
        return res.status(400).json({ error: "Already unlocked" });
      }

      user.gamification.xp -= cost;
      user.gamification.unlockedPersonalities.push(personalityId);
      user.gamification.activePersonality = personalityId;
      user.markModified('gamification');
      await user.save();

      res.json({ gamification: user.gamification });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/user/personalities/active", verifyToken, async (req: any, res: any) => {
    try {
      const { personalityId } = req.body;
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!user.gamification || !user.gamification.unlockedPersonalities?.includes(personalityId)) {
        return res.status(400).json({ error: "Personality not unlocked" });
      }

      user.gamification.activePersonality = personalityId;
      user.markModified('gamification');
      await user.save();

      res.json({ gamification: user.gamification });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/auth/profile", verifyToken, async (req: any, res: any) => {
    try {
      const { name, address } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      user.name = name;
      user.address = address || "";
      await user.save();
      
      res.json({
        uid: user._id.toString(),
        email: user.email,
        name: user.name,
        picture: user.picture,
        address: user.address
      });
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/change-password", verifyToken, async (req: any, res: any) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Please provide current password and new password" });
      }
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      if (user.authProvider === 'google') {
        return res.status(400).json({ error: "Google accounts do not have a local password to change." });
      }
      
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password" });
      }
      
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
      
      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- MongoDB Data Endpoints ---

  app.get("/api/plans/:date", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const plan = await DailyPlanModel.findOne({ userId: req.uid, date: req.params.date });
      if (!plan) return res.status(404).json({ error: "No plan found for this date" });
      const obj = plan.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/plans/:date", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      let { sessions } = req.body;
      if (sessions && Array.isArray(sessions)) {
        sessions = normalizeSessions(sessions);
      }
      
      // Enforce completion rules
      if (sessions && Array.isArray(sessions)) {
        const existingPlan = await DailyPlanModel.findOne({ userId: req.uid, date: req.params.date });
        const now = new Date().getTime();

        // Carry forward the "started" flag from the existing plan so a partial update
        // (e.g. editing a single session) can't accidentally wipe another session's progress.
        for (const session of sessions) {
          if (existingPlan?.sessions) {
            const existingSession = existingPlan.sessions.find((s: any) => s.taskTitle === session.taskTitle && s.startTime === session.startTime);
            if (existingSession?.started && session.started === undefined) {
              session.started = true;
            }
          }
        }

        // Enforce completion rules: a session may only be marked completed once it has
        // actually been started, or once its time window has fully elapsed. Completing a
        // session implies it was started, so keep the two flags in sync either way.
        for (const session of sessions) {
          if (session.completed) {
            const end = new Date(session.endTime).getTime();
            // Allow 1 minute tolerance for clock skew between client and server
            const isPast = now > (end - 60000);
            if (!isPast && !session.started) {
              session.completed = false;
            } else {
              session.started = true;
            }
          }
        }

        // Enforce only one session can be "in progress" (started and not completed) at a time.
        // If the incoming payload tries to start a new session while another is already
        // running, keep the earliest one active and revert the rest.
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

      const plan = await DailyPlanModel.findOneAndUpdate(
        { userId: req.uid, date: req.params.date },
        { $set: { sessions, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      const obj = plan.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const tasks = await Task.find({ userId: req.uid }).sort({ createdAt: -1 });
      const formattedTasks = tasks.map(t => {
        const obj = t.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      res.json(formattedTasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const taskData = { ...req.body, userId: req.uid };
      delete taskData.id;
      delete taskData._id;
      const newTask = await Task.create(taskData);
      const obj = newTask.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/tasks/:id", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const existingTask = await Task.findOne({ _id: req.params.id, userId: req.uid });
      if (!existingTask) return res.status(404).json({ error: "Task not found" });

      const isNowCompleted = req.body.status === 'completed';
      const shouldAwardGamification = isNowCompleted && !existingTask.hasBeenCompleted;
      
      const updateData = { ...req.body };
      if (shouldAwardGamification) {
        updateData.hasBeenCompleted = true;
      }
      if (isNowCompleted) {
        updateData.completedAt = existingTask.completedAt || new Date().toISOString();
      } else if (req.body.status && req.body.status !== 'completed') {
        updateData.completedAt = null;
      }

      const updatedTask = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.uid },
        { $set: updateData },
        { new: true }
      );
      if (!updatedTask) return res.status(404).json({ error: "Task not found" });
      const obj = updatedTask.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;

      let gamificationUpdates = null;
      if (shouldAwardGamification) {
        gamificationUpdates = await processGamificationOnTaskComplete(req.uid, obj);
      }

      res.json({ ...obj, gamificationUpdates });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tasks/:id", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const deleted = await Task.findOneAndDelete({ _id: req.params.id, userId: req.uid });
      if (!deleted) return res.status(404).json({ error: "Task not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  function getCorrectedGoal(goalObj: any) {
    if (!goalObj) return goalObj;
    const goal = goalObj.toObject ? goalObj.toObject() : { ...goalObj };
    if (goal.type === 'habit' && goal.lastLogged) {
      const today = new Date().toISOString().split('T')[0];
      if (goal.lastLogged !== today) {
        const lastActive = new Date(goal.lastLogged);
        const todayDate = new Date(today);
        const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          goal.streak = 0;
        }
      }
    }
    return goal;
  }

  app.get("/api/goals", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const goals = await Goal.find({ userId: req.uid }).sort({ createdAt: -1 });
      const formattedGoals = goals.map(g => {
        const obj = getCorrectedGoal(g);
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      res.json(formattedGoals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/goals", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const goalData = { ...req.body, userId: req.uid };
      delete goalData.id;
      delete goalData._id;
      const newGoal = await Goal.create(goalData);
      const obj = getCorrectedGoal(newGoal);
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/goals/:id", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const existingGoal = await Goal.findOne({ _id: req.params.id, userId: req.uid });
      if (!existingGoal) return res.status(404).json({ error: "Goal not found" });

      const updateData = { ...req.body };
      if (req.body.completed === true) {
        updateData.completedAt = existingGoal.completedAt || new Date().toISOString();
      } else if (req.body.completed === false) {
        updateData.completedAt = null;
      }

      const updatedGoal = await Goal.findOneAndUpdate(
        { _id: req.params.id, userId: req.uid },
        { $set: updateData },
        { new: true }
      );
      if (!updatedGoal) return res.status(404).json({ error: "Goal not found" });
      const obj = getCorrectedGoal(updatedGoal);
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/goals/:id", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const deleted = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.uid });
      if (!deleted) return res.status(404).json({ error: "Goal not found" });
      // Delete all linked tasks as well
      await Task.deleteMany({ goalId: req.params.id, userId: req.uid });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chats", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { chatId } = req.query;
      const query: any = { userId: req.uid };
      if (chatId) {
        if (chatId === 'default') {
          query.$or = [
            { chatId: 'default' },
            { chatId: { $exists: false } },
            { chatId: null }
          ];
        } else {
          query.chatId = chatId;
        }
      }
      const chats = await ChatMessage.find(query).sort({ timestamp: 1 });
      const formatted = chats.map(c => {
        const obj = c.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chats/sessions", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const chats = await ChatMessage.find({ userId: req.uid }).sort({ timestamp: 1 });
      const sessionsMap = new Map();
      
      // Always guarantee the default session exists in the map
      sessionsMap.set('default', {
        chatId: 'default',
        title: 'Default Chat',
        timestamp: new Date(0),
        messagesCount: 0
      });

      for (const msg of chats) {
        const cId = msg.chatId || 'default';
        if (!sessionsMap.has(cId)) {
          sessionsMap.set(cId, {
            chatId: cId,
            title: msg.chatTitle || (cId === 'default' ? 'Default Chat' : 'New Chat'),
            timestamp: msg.timestamp || new Date(),
            messagesCount: 0
          });
        }
        const sess = sessionsMap.get(cId);
        sess.timestamp = msg.timestamp || new Date();
        sess.messagesCount += 1;
        
        // Dynamic title update if title is default
        if (msg.role === 'user' && (!msg.chatTitle || msg.chatTitle === 'New Chat' || msg.chatTitle === 'Default Chat' || msg.chatTitle === msg.content) && (sess.title === 'New Chat' || sess.title === 'Default Chat')) {
          sess.title = msg.content.substring(0, 40) + (msg.content.length > 40 ? '...' : '');
        }
      }
      const sessions = Array.from(sessionsMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/chats/sessions/:chatId", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { chatId } = req.params;
      const query: any = { userId: req.uid };
      if (chatId === 'default') {
        query.$or = [
          { chatId: 'default' },
          { chatId: { $exists: false } },
          { chatId: null }
        ];
      } else {
        query.chatId = chatId;
      }
      await ChatMessage.deleteMany(query);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/chats/sessions/:chatId", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { chatId } = req.params;
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Title is required" });
      }
      const query: any = { userId: req.uid };
      if (chatId === 'default') {
        query.$or = [
          { chatId: 'default' },
          { chatId: { $exists: false } },
          { chatId: null }
        ];
      } else {
        query.chatId = chatId;
      }
      await ChatMessage.updateMany(query, { chatTitle: title });
      res.json({ success: true, title });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chats", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { role, content, chatId, chatTitle } = req.body;
      const newChat = await ChatMessage.create({
        userId: req.uid,
        role,
        content,
        chatId: chatId || 'default',
        chatTitle: chatTitle || 'New Chat',
        timestamp: new Date()
      });
      const obj = newChat.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai-decisions", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const decisions = await AIDecision.find({ userId: req.uid }).sort({ timestamp: -1 });
      const formatted = decisions.map(d => {
        const obj = d.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-decisions", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { title, reason } = req.body;
      const newDecision = await AIDecision.create({
        userId: req.uid,
        title,
        reason,
        timestamp: new Date()
      });
      const obj = newDecision.toObject();
      obj.id = obj._id.toString();
      delete obj._id;
      delete obj.__v;
      res.json(obj);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/models", verifyToken, async (req: any, res: any) => {
    try {
      const response = await ai.models.list();
      let modelsList: any[] = [];
      if (response && Array.isArray(response)) {
        modelsList = response;
      } else if (response && (response as any).models && Array.isArray((response as any).models)) {
        modelsList = (response as any).models;
      } else {
        modelsList = Object.values(response || {});
      }

      // Format and filter to gemini text models
      let formattedList = modelsList
        .map((m: any) => ({
          name: m.name || m.model || "",
          displayName: m.displayName || m.name?.split('/').pop() || m.name || ""
        }))
        .filter((m: any) => {
          const name = (m.name || "").toLowerCase();
          return name.includes("gemini") && 
                 !name.includes("embed") &&
                 !name.includes("gemini-2.0-flash") &&
                 !name.includes("gemini-1.5") &&
                 !name.includes("gemini-pro");
        });

      // If list is empty or doesn't have the key models, merge or use curated fallback
      if (formattedList.length === 0) {
        formattedList = [
          { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash (Default)" },
          { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
          { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)" }
        ];
      }

      res.json(formattedList);
    } catch (err: any) {
      console.error("Error listing models:", err);
      res.json([
        { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash (Default)" },
        { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
        { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)" }
      ]);
    }
  });
  
  app.get("/api/calendar/events", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const { timeMin, timeMax } = req.query;
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error('Error fetching events:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/calendar/events", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: req.body,
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error('Error creating event:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/docs", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const { title, content } = req.body;
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const docs = google.docs({ version: 'v1', auth: oauth2Client });
      
      // 1. Create empty doc
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      
      // 2. Insert content
      if (doc.data.documentId) {
        await docs.documents.batchUpdate({
          documentId: doc.data.documentId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content
                }
              }
            ]
          }
        });
      }
      
      res.json(doc.data);
    } catch (error: any) {
      console.error('Error creating Google Doc:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/docs/generate-report", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const { title, tasks, completedTasks, goals } = req.body;
      
      let segments: any[] = [];
      try {
        const prompt = `You are a professional assistant generating a comprehensive daily progress report for a user.
        Data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t:any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t:any) => t.title))}
        - Goals and Habits: ${JSON.stringify((goals || []).map((g:any) => ({ title: g.title, type: g.type })))}
        
        Write a detailed but concise report summarizing:
        1. Overall productivity and status of tasks.
        2. Progress on habits and goals.
        3. Recommendations for tomorrow.
        
        Output a JSON array of text segments, applying formatting such as bold, italic, underline, or headings to improve visual info.
        Example format:
        [
          { "text": "Daily Progress Report\\n", "heading": "HEADING_1" },
          { "text": "Overview\\n", "heading": "HEADING_2" },
          { "text": "You completed ", "bold": false },
          { "text": "3 tasks", "bold": true },
          { "text": " today.\\n\\n", "bold": false }
        ]
        Valid headings: HEADING_1, HEADING_2, HEADING_3, NORMAL_TEXT. Ensure all paragraph breaks have \n. Do not include markdown like **.`;
        
        const aiRes = await generateContentWithRetry({
          model: 'gemini-3.5-flash',
          contents: prompt
        });
        let text = aiRes.text || "[]";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        segments = JSON.parse(text);
      } catch (err) {
        console.error("AI generation failed for docs:", err);
        segments = [{ text: `Daily Progress Report\nTasks Completed: ${completedTasks?.length || 0}\nRemaining Tasks: ${tasks?.length || 0}\n` }];
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const docs = google.docs({ version: 'v1', auth: oauth2Client });
      
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      
      if (doc.data.documentId && segments.length > 0) {
        const fullText = segments.map(s => s.text).join("");
        const requests: any[] = [
          {
            insertText: {
              location: { index: 1 },
              text: fullText
            }
          }
        ];
        
        let currentIndex = 1;
        for (const segment of segments) {
          const segmentLength = segment.text.length;
          const startIndex = currentIndex;
          const endIndex = currentIndex + segmentLength;
          
          if (segment.bold || segment.italic || segment.underline) {
            const textStyle: any = {};
            const fields: string[] = [];
            if (segment.bold) { textStyle.bold = true; fields.push("bold"); }
            if (segment.italic) { textStyle.italic = true; fields.push("italic"); }
            if (segment.underline) { textStyle.underline = true; fields.push("underline"); }
            
            requests.push({
              updateTextStyle: {
                range: { startIndex, endIndex },
                textStyle,
                fields: fields.join(",")
              }
            });
          }
          
          if (segment.heading && segment.heading !== "NORMAL_TEXT") {
            requests.push({
              updateParagraphStyle: {
                range: { startIndex, endIndex },
                paragraphStyle: { namedStyleType: segment.heading },
                fields: "namedStyleType"
              }
            });
          }
          
          currentIndex += segmentLength;
        }

        await docs.documents.batchUpdate({
          documentId: doc.data.documentId,
          requestBody: { requests }
        });
      }
      
      res.json(doc.data);
    } catch (error: any) {
      console.error('Error creating Google Doc report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/presentations/generate", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const { type, tasks, completedTasks, goals } = req.body;
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const slides = google.slides({ version: 'v1', auth: oauth2Client });
      
      let title = "Generated Presentation";
      if (type === 'project-dashboard') title = `Project Status - ${new Date().toLocaleDateString()}`;
      if (type === 'standup') title = `Daily Standup - ${new Date().toLocaleDateString()}`;
      if (type === 'sprint-planning') title = `Sprint Planning - ${new Date().toLocaleDateString()}`;
      if (type === 'progress-report') title = `Progress Report - ${new Date().toLocaleDateString()}`;
      
      const response = await slides.presentations.create({
        requestBody: { title },
      });
      
      const presId = response.data.presentationId;
      if (!presId) throw new Error("Could not create presentation");

      const requests: any[] = [];
      
      // Populate the default first slide
      const firstSlide = response.data.slides?.[0];
      if (firstSlide && firstSlide.pageElements) {
        const titleElement = firstSlide.pageElements.find(
          (e: any) => e.shape?.placeholder?.type === 'CENTERED_TITLE' || e.shape?.placeholder?.type === 'TITLE'
        );
        if (titleElement?.objectId) {
          requests.push({
            insertText: {
              objectId: titleElement.objectId,
              text: title
            }
          });
        }
        
        const subtitleElement = firstSlide.pageElements.find(
          (e: any) => e.shape?.placeholder?.type === 'SUBTITLE'
        );
        if (subtitleElement?.objectId) {
          requests.push({
            insertText: {
              objectId: subtitleElement.objectId,
              text: `Generated by TaskPilot AI`
            }
          });
        }
      }

      let slideIdCounter = 1;

      // Slide 2: Main Content Slide
      const slide2Id = `slide_content_${Date.now()}`;
      requests.push({
        createSlide: {
          objectId: slide2Id,
          slideLayoutReference: { predefinedLayout: 'BLANK' }
        }
      });
      
      const titleBoxId = `textbox_title_${Date.now()}`;
      requests.push({
        createShape: {
          objectId: titleBoxId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slide2Id,
            size: { height: { magnitude: 60, unit: 'PT' }, width: { magnitude: 600, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 30, unit: 'PT' }
          }
        }
      });
      
      requests.push({
        insertText: {
          objectId: titleBoxId,
          text: "Executive Summary"
        }
      });
      
      const textBoxId = `textbox_body_${Date.now()}`;
      requests.push({
        createShape: {
          objectId: textBoxId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slide2Id,
            size: { height: { magnitude: 300, unit: 'PT' }, width: { magnitude: 600, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 100, unit: 'PT' }
          }
        }
      });
      
      let textContent = "";
      try {
        const prompt = `You are a professional assistant generating a 3-5 bullet point slide summary for a "${title}" presentation.
        Use this data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t:any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t:any) => t.title))}
        - Goals/Habits: ${JSON.stringify((goals || []).map((g:any) => g.title))}
        Keep it concise, plain text only, no markdown formatting like ** or ##, just use standard bullet points (-). Make it professional.`;
        
        const aiRes = await generateContentWithRetry({
          model: 'gemini-3.5-flash',
          contents: prompt
        });
        textContent = aiRes.text || "Summary generated successfully.";
      } catch (err) {
        console.error("AI generation failed for slides:", err);
        textContent = `${title}\n\nTasks Pending: ${tasks?.length || 0}\nCompleted: ${completedTasks?.length || 0}`;
      }
      
      requests.push({
        insertText: {
          objectId: textBoxId,
          text: textContent
        }
      });
      
      if (requests.length > 0) {
        await slides.presentations.batchUpdate({
          presentationId: presId,
          requestBody: { requests }
        });
      }
      
      res.json(response.data);
    } catch (error: any) {
      console.error('Error creating presentation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sheets", async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      if (!accessToken) return res.status(401).send("No access token");
      
      const { title, data } = req.body;
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken, token_type: 'Bearer' });
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      
      // 1. Create spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: { properties: { title } }
      });
      
      // 2. Append data
      if (spreadsheet.data.spreadsheetId) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheet.data.spreadsheetId,
          range: 'Sheet1!A1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: data }
        });
      }
      
      res.json(spreadsheet.data);
    } catch (error: any) {
      console.error('Error creating Google Sheet:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Custom Google OAuth Routes (Using google-auth-library) ---

  // Endpoint to expose Google Client ID to frontend for GIS SDK
  app.get("/api/config", (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
  });

  // Handle GIS popup code exchange
  app.post("/api/auth/google/callback", async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).send("Code is missing");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("Google OAuth credentials are not fully configured in .env");
    }

    const oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: "postmessage",
    });

    try {
      const { tokens } = await oauth2Client.getToken(code);
      const accessToken = tokens.access_token;
      oauth2Client.setCredentials(tokens);

      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) return res.status(500).send("Failed to fetch user profile from Google");

      const userInfo = await userRes.json();
      const { sub: googleUid, email, name, picture } = userInfo;
      if (!email) return res.status(400).send("Google account has no email address to sign in with.");

      // Check for an existing authenticated user session
      let currentUserId: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split('Bearer ')[1];
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          currentUserId = decoded.uid;
        } catch (err) {
          // ignore invalid token in header
        }
      }

      await connectDB();

      // Check if this Google account is already linked to another user
      const existingLinkedUser = await User.findOne({
        $or: [
          { googleId: googleUid },
          { googleEmail: email.toLowerCase() },
          { email: email.toLowerCase(), authProvider: 'google' }
        ]
      });

      let user: any;

      if (currentUserId) {
        // Active session: bind Google account to current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
          return res.status(404).send("Current user session not found");
        }

        if (existingLinkedUser) {
          if (existingLinkedUser._id.toString() !== currentUserId) {
            return res.status(400).send("google email already connected to other email, sign in with google or with other email");
          }
          user = existingLinkedUser;
        } else {
          currentUser.googleId = googleUid;
          currentUser.googleEmail = email.toLowerCase();
          if (tokens.refresh_token) {
            currentUser.googleRefreshToken = tokens.refresh_token;
          }
          if (picture && !currentUser.picture) currentUser.picture = picture;
          await currentUser.save();
          user = currentUser;
        }
      } else {
        // Direct login / sign-in (no active session)
        if (existingLinkedUser) {
          user = existingLinkedUser;
          if (tokens.refresh_token) {
            user.googleRefreshToken = tokens.refresh_token;
          }
          if (picture && !user.picture) user.picture = picture;
          await user.save();
        } else {
          user = await User.findOne({ email: email.toLowerCase() });
          if (!user) {
            user = await User.create({
              email: email.toLowerCase(),
              name: name || email,
              picture,
              authProvider: "google",
              googleId: googleUid,
              googleEmail: email.toLowerCase(),
              googleRefreshToken: tokens.refresh_token || undefined,
            });
          } else {
            user.authProvider = "google";
            user.googleId = googleUid;
            user.googleEmail = email.toLowerCase();
            if (picture && !user.picture) user.picture = picture;
            if (tokens.refresh_token) user.googleRefreshToken = tokens.refresh_token;
            await user.save();
          }
        }
      }

      const taskpilotToken = jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        accessToken,
        taskpilotToken,
        user: { email: user.email, name: user.name, picture: user.picture, uid: user._id.toString(), gamification: getCorrectedGamification(user.gamification) }
      });
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      res.status(500).send(`Authentication error: ${err.message}`);
    }
  });

  // This server is reachable on more than one domain (e.g. a test URL and a
  // prod URL) at the same time, so we can't hardcode a single APP_URL for
  // building the OAuth redirect_uri. Instead we derive the origin from the
  // incoming request and check it against an explicit allowlist — never
  // trust the Host header blindly, since redirect_uri ends up in a Google
  // API call and an unvalidated host would be an open-redirect risk.
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.APP_URL || "")
    .split(",")
    .map(o => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const getRequestOrigin = (req: any) => {
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const finalProto = host.includes('.run.app') ? 'https' : proto;
    return `${finalProto}://${host}`;
  };

  const resolveAllowedOrigin = (req: any): string | null => {
    const origin = getRequestOrigin(req);
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
  };

  const getRedirectUri = (origin: string) => `${origin}/oauth2callback`;

  app.get("/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured in .env" });
    }

    const origin = resolveAllowedOrigin(req);
    if (!origin) {
      return res.status(400).json({
        error: `This domain (${getRequestOrigin(req)}) is not in ALLOWED_ORIGINS. Add it to your .env and to Google Cloud Console's Authorized JavaScript origins / redirect URIs.`
      });
    }

    const oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: getRedirectUri(origin),
    });

    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/tasks.readonly"
    ];

    // Stateless CSRF protection: sign a short-lived, single-use-window token
    // instead of relying on server-side session storage (the server may be
    // running multiple Cloud Run instances with no shared session store).
    // The origin is embedded *inside* the signed token (not read again from
    // the callback request) so the redirect_uri used to exchange the code is
    // guaranteed to be the exact same one used to generate this auth URL,
    // and can't be swapped by a malicious callback request.
    let currentUserId: string | null = null;
    const authHeader = req.headers.authorization || req.query.token;
    if (authHeader) {
      const token = (authHeader as string).replace('Bearer ', '');
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        currentUserId = decoded.uid;
      } catch {}
    }

    const state = jwt.sign({ purpose: "oauth_state", origin, currentUserId }, JWT_SECRET, { expiresIn: "10m" });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      include_granted_scopes: true,
      prompt: "consent",
      state,
    });

    res.json({ url: authUrl });
  });

  app.get(["/oauth2callback", "/oauth2callback/"], async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      // User denied consent or Google returned an error (e.g. access_denied)
      return res.status(400).send(`Google sign-in was cancelled or failed: ${oauthError}`);
    }
    if (!code) {
      return res.status(400).send("Authorization code is missing");
    }

    // Verify the CSRF state token minted by /auth/google, and pull the
    // origin out of it (signed, so it can't be tampered with) rather than
    // trusting the request's Host header again here.
    let origin: string;
    let currentUserId: string | null = null;
    try {
      const decoded = jwt.verify(state as string, JWT_SECRET) as any;
      if (decoded.purpose !== "oauth_state" || !decoded.origin) throw new Error("bad state payload");
      origin = decoded.origin;
      currentUserId = decoded.currentUserId || null;
      if (!ALLOWED_ORIGINS.includes(origin)) throw new Error("origin no longer allowed");
    } catch {
      return res.status(401).send("Invalid or expired authentication request. Please try signing in again.");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("Google OAuth credentials are not fully configured in .env");
    }

    const oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: getRedirectUri(origin),
    });

    try {
      // 1. Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);
      const accessToken = tokens.access_token;

      oauth2Client.setCredentials(tokens);

      // 2. Fetch User Profile
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) {
        return res.status(500).send("Failed to fetch user profile from Google");
      }

      const userInfo = await userRes.json();
      const { sub: googleUid, email, name, picture } = userInfo;
      if (!email) {
        return res.status(400).send("Google account has no email address to sign in with.");
      }

      await connectDB();

      // Check if this Google account is already linked to another user
      const existingLinkedUser = await User.findOne({
        $or: [
          { googleId: googleUid },
          { googleEmail: email.toLowerCase() },
          { email: email.toLowerCase(), authProvider: 'google' }
        ]
      });

      let user: any;

      if (currentUserId) {
        // Active session: bind Google account to current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
          return res.status(404).send("Current user session not found");
        }

        if (existingLinkedUser) {
          if (existingLinkedUser._id.toString() !== currentUserId) {
            return res.status(400).send("google email already connected to other email, sign in with google or with other email");
          }
          user = existingLinkedUser;
        } else {
          currentUser.googleId = googleUid;
          currentUser.googleEmail = email.toLowerCase();
          if (tokens.refresh_token) {
            currentUser.googleRefreshToken = tokens.refresh_token;
          }
          if (picture && !currentUser.picture) currentUser.picture = picture;
          await currentUser.save();
          user = currentUser;
        }
      } else {
        // Direct login / sign-in (no active session)
        if (existingLinkedUser) {
          user = existingLinkedUser;
          if (tokens.refresh_token) {
            user.googleRefreshToken = tokens.refresh_token;
          }
          if (picture && !user.picture) user.picture = picture;
          await user.save();
        } else {
          user = await User.findOne({ email: email.toLowerCase() });
          if (!user) {
            user = await User.create({
              email: email.toLowerCase(),
              name: name || email,
              picture,
              authProvider: "google",
              googleId: googleUid,
              googleEmail: email.toLowerCase(),
              googleRefreshToken: tokens.refresh_token || undefined,
            });
          } else {
            user.authProvider = "google";
            user.googleId = googleUid;
            user.googleEmail = email.toLowerCase();
            if (picture && !user.picture) user.picture = picture;
            if (tokens.refresh_token) user.googleRefreshToken = tokens.refresh_token;
            await user.save();
          }
        }
      }

      const taskpilotToken = jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });

      // 4. Return HTML to notify parent window. We post to a specific
      // target origin (not '*') so the access token can't be read by an
      // unrelated page if the opener has since navigated elsewhere.
      const targetOrigin = origin;
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #0d1117;
                color: #c9d1d9;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
              }
              .spinner {
                border: 4px solid rgba(255, 255, 255, 0.1);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border-left-color: #58a6ff;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="spinner"></div>
            <h3>Authentication successful!</h3>
            <p>Closing window and returning to app...</p>
            <script>
              const authData = {
                type: 'GOOGLE_AUTH_SUCCESS',
                accessToken: ${JSON.stringify(accessToken)},
                taskpilotToken: ${JSON.stringify(taskpilotToken)},
                user: ${JSON.stringify({ email: user.email, name: user.name, picture: user.picture, uid: user._id.toString() })}
              };

              if (window.opener) {
                window.opener.postMessage(authData, ${JSON.stringify(targetOrigin)});
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      res.status(500).send(`Authentication error: ${err.message}`);
    }
  });

  // --- AI Planning Routes ---
  
  app.post("/api/generate-quest-steps", verifyToken, async (req: any, res: any) => {
    const { title, description, targetDate, model } = req.body;
    try {
      const selectedModel = getValidModel(model);
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
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      
      // Fallback: If AI returned "steps" instead of "tasks", convert steps to tasks gracefully
      if (result.steps && !result.tasks) {
        const generatedDate = new Date();
        result.tasks = result.steps.map((step: string, index: number) => {
          const deadlineDate = new Date(generatedDate);
          deadlineDate.setDate(deadlineDate.getDate() + (index + 1) * 2);
          return {
            title: step,
            description: "",
            deadline: targetDate ? new Date(targetDate).toISOString() : deadlineDate.toISOString(),
            priority: "medium",
            estimatedHours: 2,
            riskScore: 30
          };
        });
      }
      
      res.json(result);
    } catch (err: any) {
      console.error("Gemini Quest Steps generation failed, using programmatic fallback:", err);
      
      const generatedDate = new Date();
      const fallbackTasks = [
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
          description: `Code the key functional modules, integrate APIs or services, and refine features.`,
          deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
          priority: "high",
          estimatedHours: 8,
          riskScore: 50,
          resources: ["https://stackoverflow.com"]
        },
        {
          title: `Comprehensive testing and polish of "${title}"`,
          description: `Perform detailed testing, resolve bugs, polish styling, and package the final deliverables.`,
          deadline: targetDate ? new Date(targetDate).toISOString() : new Date(generatedDate.getTime() + 12 * 24 * 60 * 60 * 1000).toISOString(),
          priority: "medium",
          estimatedHours: 3,
          riskScore: 30,
          resources: ["https://web.dev"]
        }
      ];

      res.json({ tasks: fallbackTasks });
    }
  });

  app.post("/api/analyze-task", verifyToken, async (req: any, res: any) => {
    const { title, description, deadline, model } = req.body;
    try {
      const selectedModel = getValidModel(model);
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
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      // Clean up markdown block if present
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error("Gemini Task Analysis failed, using programmatic fallback:", err);
      
      // Calculate simple programmatic metrics based on title length and deadline
      const estimatedHours = title.length > 30 ? 5 : 2;
      const priority = (title.toLowerCase().includes("urgent") || title.toLowerCase().includes("asap") || title.toLowerCase().includes("important")) ? "high" : "medium";
      const riskScore = deadline ? 65 : 25;
      
      const fallbackResult = {
        estimatedHours,
        priority,
        subtasks: [
          `Prepare initial resources and outline steps for "${title}"`,
          `Execute main implementation steps`,
          `Perform review and verify deliverables`
        ],
        riskScore,
        confidenceScore: 85
      };

      res.json(fallbackResult);
    }
  });

  app.post("/api/generate-subtasks", verifyToken, async (req: any, res: any) => {
    const { title, description, model } = req.body;
    try {
      const selectedModel = getValidModel(model);
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
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      if (result && Array.isArray(result.subtasks)) {
        return res.json(result);
      }
      throw new Error("Invalid response format from Gemini");
    } catch (err: any) {
      console.error("Gemini Generate Subtasks Error, using fallback:", err);
      
      // Fallback: Programmatic subtask generation to prevent app-blocking errors
      const lowerTitle = title.toLowerCase();
      let fallbackSubtasks = [
        `Plan and outline the requirements for "${title}"`,
        `Execute core implementation and setup`,
        `Verify, test, and complete "${title}"`
      ];

      if (lowerTitle.includes("website") || lowerTitle.includes("app") || lowerTitle.includes("page")) {
        fallbackSubtasks = [
          `Sketch UI layouts and design mockups`,
          `Build responsive frontend components`,
          `Connect state or backend API endpoints`,
          `Perform end-to-end user experience testing`
        ];
      } else if (lowerTitle.includes("db") || lowerTitle.includes("database") || lowerTitle.includes("sql") || lowerTitle.includes("schema")) {
        fallbackSubtasks = [
          `Define data relationships and schemas`,
          `Write migration scripts and initialize database`,
          `Test database queries and optimize indexes`
        ];
      } else if (lowerTitle.includes("write") || lowerTitle.includes("blog") || lowerTitle.includes("content") || lowerTitle.includes("essay")) {
        fallbackSubtasks = [
          `Gather references and create a rough outline`,
          `Draft the main sections and introduction`,
          `Proofread, format, and publish final draft`
        ];
      }

      res.json({
        subtasks: fallbackSubtasks,
        isFallback: true
      });
    }
  });

  app.post("/api/audio-journal", verifyToken, async (req: any, res: any) => {
    try {
      const { text, model } = req.body;
      const selectedModel = getValidModel(model);
      const prompt = `
        You are an intelligent productivity assistant analyzing an audio journal reflection.
        Read the following transcript of a user's voice reflection.
        Transcript: "${text}"
        
        Extract all actionable tasks from this reflection. Also provide a short 1-2 sentence summary of the journal entry.
        
        Return a JSON response exactly in this format, no markdown formatting:
        {
          "summary": "Short summary of reflection.",
          "tasks": [
            {
              "title": "Clear action item",
              "description": "Any additional context mentioned",
              "priority": "high|medium|low"
            }
          ]
        }
      `;
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      let outText = response.text || "{}";
      outText = outText.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(outText);
      
      // Auto-create tasks
      const createdTasks = [];
      if (result.tasks && Array.isArray(result.tasks)) {
        for (const t of result.tasks) {
          const newTask = new Task({
            userId: req.user.uid,
            title: t.title,
            description: t.description || "",
            priority: t.priority || "medium",
            status: "pending",
            category: "Journal",
            estimatedHours: 1,
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // default to 7 days
          });
          await newTask.save();
          createdTasks.push(newTask);
        }
      }
      
      res.json({ summary: result.summary, createdTasks });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Failed to process audio journal" });
    }
  });

  app.post("/api/generate-plan", verifyToken, async (req: any, res: any) => {
    const { tasks, date, model } = req.body;
    try {
      await connectDB();
      const selectedModel = getValidModel(model);

      const currentPlan = await DailyPlanModel.findOne({ userId: req.uid, date });
      if (!currentPlan || !currentPlan.sessions || currentPlan.sessions.length === 0) {
        return res.status(400).json({ error: "No timetable found for today. Please go to Timetable and generate a daily routine first." });
      }

      const prompt = `
        You are an autonomous AI planning assistant.
        Your job is to schedule the user's pending tasks into their EXISTING daily timetable.
        
        Pending Tasks:
        ${JSON.stringify(tasks, null, 2)}
        
        Current Timetable:
        ${JSON.stringify(currentPlan.sessions, null, 2)}
        
        CRITICAL RULES:
        0. THE TIMETABLE STRUCTURE IS FIXED AND IMMUTABLE. Do NOT change the number of sessions, their start times, or end times.
        1. Identify slots in the timetable that are suitable for work (e.g., "Deep Work", "Focus", "Work Session", or generic activity blocks).
        2. Assign pending tasks to these work slots. 
        3. For a slot where a task is assigned, change the "taskTitle" to EXACTLY match the title of the assigned pending task, and set "taskId" to the task's id.
        4. Do NOT modify the "taskTitle" of non-work slots (e.g., Lunch, Workout, Sleep, Routine). Leave them exactly as they are.
        5. Return the full modified timetable in the exact same format.

        Return a JSON response exactly in this format, no markdown formatting:
        {
          "sessions": [
            {
              "taskId": "<id or temp-task-id>",
              "taskTitle": "<exact title of task, or original routine title>",
              "startTime": "YYYY-MM-DDTHH:mm:ss.sss",
              "endTime": "YYYY-MM-DDTHH:mm:ss.sss"
            }
          ]
        }
      `;
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);

      if (result.sessions && Array.isArray(result.sessions)) {
        const normalizedResult = normalizeSessions(result.sessions);

        // The AI is only supposed to slot tasks into the EXISTING, immutable timetable
        // (see prompt rule 0), but its response schema only carries taskId/taskTitle/
        // startTime/endTime. Saving that verbatim would wipe every session's completed/
        // started progress flags. Instead, merge just the taskId/taskTitle assignment
        // back onto the existing session objects (matched by original start/end time),
        // and keep every other existing field — including completed/started — intact.
        const existingSessions = currentPlan.sessions || [];
        const mergedSessions = existingSessions.map((existing: any) => {
          const existingStart = new Date(existing.startTime).getTime();
          const existingEnd = new Date(existing.endTime).getTime();
          const match = normalizedResult.find((s: any) => {
            const start = new Date(s.startTime).getTime();
            const end = new Date(s.endTime).getTime();
            return start === existingStart && end === existingEnd;
          });
          if (!match) return existing;
          return {
            ...existing,
            taskId: match.taskId,
            taskTitle: match.taskTitle
          };
        });

        result.sessions = mergedSessions;
        await DailyPlanModel.findOneAndUpdate(
          { userId: req.uid, date },
          { $set: { sessions: mergedSessions, updatedAt: new Date() } },
          { new: true }
        );
      }

      res.json(result);
    } catch (err: any) {
      console.error("Gemini Plan Generation failed:", err);
      res.status(500).json({ error: err.message || "Failed to schedule tasks. Timetable may be empty." });
    }
  });

  app.post("/api/chat", verifyToken, async (req: any, res: any) => {
    try {
      const { messages, context, model, localDateStr, localTimeStr } = req.body;
      const selectedModel = getValidModel(model);
      
      const user = await User.findById(req.uid);
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
        - Today's local date is: ${localDateStr || new Date().toISOString().split('T')[0]}. The user's current local time is: ${localTimeStr || new Date().toLocaleTimeString()}.
        - IMPORTANT FORMATTING: You MUST format all 'startTime' and 'endTime' strings as timezone-naive ISO strings using the user's local date/time directly with NO trailing 'Z' and NO offset like '+07:00'. For example, if you want a session to start at 07:30 AM on today's local date ${localDateStr || new Date().toISOString().split('T')[0]}, output exactly: "${localDateStr || new Date().toISOString().split('T')[0]}T07:30:00.000".
        - Ensure JSON is valid and has no backticks, markdown block wrapper, or characters other than the raw JSON string between the start and end tags.
        - Include this plan and JSON block whenever the user wants to set, change, or update their timetable or daily routine structure.
      `;
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "";
      let planUpdated = false;
      
      // Parse potential plan block
      const startTag = "[SET_DAILY_PLAN_START]";
      const endTag = "[SET_DAILY_PLAN_END]";
      if (text.includes(startTag) && text.includes(endTag)) {
        try {
          const startIndex = text.indexOf(startTag);
          const endIndex = text.indexOf(endTag);
          const jsonText = text.substring(startIndex + startTag.length, endIndex).trim();
          const cleanJsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleanJsonText);
          
          if (parsed.sessions && Array.isArray(parsed.sessions)) {
            const todayDateStr = localDateStr || new Date().toISOString().split('T')[0];
            await connectDB();
            
            const formattedSessions = normalizeSessions(parsed.sessions.map((s: any) => ({
              taskId: s.taskId || "temp-task-id",
              taskTitle: s.taskTitle,
              startTime: s.startTime,
              endTime: s.endTime
            })));
            
            await DailyPlanModel.findOneAndUpdate(
              { userId: req.uid, date: todayDateStr },
              { $set: { sessions: formattedSessions, updatedAt: new Date() } },
              { upsert: true, new: true }
            );
            
            // Also log an AIDecision
            await AIDecision.create({
              userId: req.uid,
              title: "Timetable Generated via Chat",
              reason: "A custom timetable was generated and applied directly based on your instructions in the Mission Control Chat.",
              timestamp: new Date()
            });
            
            planUpdated = true;
          }
          
          // Strip the plan block from the text response so it is completely clean for the user
          text = (text.substring(0, startIndex) + text.substring(endIndex + endTag.length)).trim();
        } catch (e) {
          console.error("Failed to parse daily plan from chat assistant response:", e);
        }
      }
      
      res.json({ text, planUpdated });
    } catch (err: any) {
      console.error("Gemini Chat failed, returning personality fallback response:", err);
      
      let fallbackText = "Our main neural transmitters are experiencing high traffic (API rate limit). Your local schedule is fully armed and ready. How else can I support you today?";
      
      try {
        const user = await User.findById(req.uid);
        const activePersonality = user?.gamification?.activePersonality || 'default';
        
        if (activePersonality === 'drill_sergeant') {
          fallbackText = "RECRUIT! We've hit a communication static (API Rate Limit). But a true soldier never halts! No excuses! Keep moving forward, stay disciplined, and execute your current daily missions! Drop and give me 20!";
        } else if (activePersonality === 'zen_guide') {
          fallbackText = "A gentle pause in the stream of thoughts (API Rate Limit). Let us appreciate this quiet, peaceful moment. Your path remains completely clear. Rely on your internal structure, take a deep breath, and move mindfully through your day.";
        } else if (activePersonality === 'executive') {
          fallbackText = "Status Notification: The communication stream is temporarily experiencing heavy load (API Rate Limit). Operational recommendation: Leverage your pre-scheduled programmatic daily blocks to execute tasks without downtime.";
        }
      } catch (dbErr) {
        // Safe failover
      }

      res.json({ text: fallbackText, planUpdated: false });
    }
  });

  app.post("/api/autonomous-pipeline", verifyToken, async (req: any, res: any) => {
    const { eventName, eventDetail, tasks, model, dayDescription, localDateStr, localTimeStr } = req.body;
    const userId = req.uid;
    try {
      const selectedModel = getValidModel(model);

      const prompt = `
        You are an autonomous AI Productivity Agent designing a General Daily Timetable of Total Discipline.
        The timeline MUST be a complete structured routine representing a perfectly disciplined day, covering activities from wake-up to sleeping time.
        
        An event just occurred: "${eventName}"
        Details: "${eventDetail}"
        User's Current Local Time: ${localTimeStr || new Date().toLocaleTimeString()}
        User's Current Local Date: ${localDateStr || new Date().toISOString().split('T')[0]}
        
        USER'S DAY DESCRIPTION & PREFERENCES:
        ${dayDescription ? `"${dayDescription}"` : "None specified. Design a classic balanced high-discipline routine."}
        
        Active Quests/Tasks to integrate:
        ${JSON.stringify(tasks.map((t: any) => ({ title: t.title, priority: t.priority, estimatedHours: t.estimatedHours, riskScore: t.riskScore })))}
        
        You must formulate a continuous, contiguous schedule spanning the user's entire day (from wake up to sleep). Do not just schedule active tasks. You MUST include general routine sessions to fill the day.
        
        CRITICAL TIME & LABEL ALIGNMENT RULES:
        0. THE TIMETABLE STRUCTURE IS FIXED AND IMMUTABLE. If a day description is provided, follow its structure exactly, including start times, end times, and activity types. You are only permitted to map the provided tasks into the specified slots. Do NOT change or reorder the timetable slots.
        1. Every session MUST be contiguous (no gaps in time where the person has zero structure).
        2. IMPORTANT: Do NOT start scheduling sessions starting from the current clock hour of the request. (For example, if the current time is 11 PM or 2 AM, do NOT discard the morning or afternoon routine). Always generate a full, contiguous 24-hour daily routine representing a perfectly disciplined day starting in the morning (e.g. 05:30 AM or 06:00 AM) of today's date: ${localDateStr || new Date().toISOString().split('T')[0]}, all the way to late night (e.g. 10:30 PM or midnight) and sleep.
        3. Adjust the times and activity titles based on the user's day preferences:
           - If they are an early bird, wake up could be 05:00 or 06:00.
           - If they are a night owl or work late, slide the whole timeline so it's realistic for them.
           - Ensure titles match the chronological hours! For example:
             * Morning: Wake Up, Hydrate, Refresh, Breakfast, Morning Focus.
             * Midday: Lunch, Post-Lunch Recharge, Afternoon Focus.
             * Evening: Fitness/Workout, Dinner, Reflection.
             * Night: Wind Down, Evening Planning, Sleep.
             * DO NOT schedule a session titled "Afternoon Review" or "Lunch" at 22:00 (10 PM) or 23:00 (11 PM). Late night slots should be "Night Wind Down", "Offline Reading", "Pre-Sleep Routine", or "Sleep".
        4. Allocate 1 or 2 deep work focus blocks to integrate the user's active tasks (e.g., matching the title of tasks in the active quests list).
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
              { "startTime": "YYYY-MM-DDTHH:mm:ss.sss", "endTime": "YYYY-MM-DDTHH:mm:ss.sss", "taskTitle": "Session or Task Title (e.g. Wake up & Refresh, Morning Deep Work: [Task Title], Breakfast & Prep, etc.)" }
            ]
          }
        }

        IMPORTANT FORMATTING RULE: You MUST format all 'startTime' and 'endTime' strings as timezone-naive ISO strings using the user's local date/time directly with NO trailing 'Z' and NO offset like '+07:00'. For example, if you want a session to start at 07:30 AM on today's local date ${localDateStr || new Date().toISOString().split('T')[0]}, output exactly: "${localDateStr || new Date().toISOString().split('T')[0]}T07:30:00.000".
      `;
      
      const response = await generateContentWithRetry({
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      
      // Save decision to MongoDB
      if (result.decision) {
        try {
          await connectDB();
          await AIDecision.create({
            userId,
            title: result.decision.text || result.decision.title || "Schedule Adjustment",
            reason: result.decision.reason,
            timestamp: new Date()
          });
        } catch (dbErr) {
          console.warn("Could not save decision to MongoDB:", dbErr);
        }
      }
      
      // Save plan to MongoDB
      const todayDateStr = localDateStr || new Date().toISOString().split('T')[0];
      try {
        await connectDB();
        if (result.plan && result.plan.sessions && result.plan.sessions.length > 0) {
          const formattedSessions = normalizeSessions(result.plan.sessions.map((s: any) => ({
            taskId: s.taskId || "temp-task-id",
            taskTitle: s.taskTitle,
            startTime: s.startTime,
            endTime: s.endTime
          })));
          await DailyPlanModel.findOneAndUpdate(
            { userId, date: todayDateStr },
            { $set: { sessions: formattedSessions, updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        } else if (tasks.length === 0) {
          await DailyPlanModel.findOneAndUpdate(
            { userId, date: todayDateStr },
            { $set: { sessions: [], updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        }
      } catch (dbErr) {
        console.warn("Could not save plan to MongoDB:", dbErr);
      }

      res.json(result);
    } catch (err: any) {
      console.error("Gemini Autonomous Pipeline failed, using programmatic fallback:", err);
      
      const baseDateStr = localDateStr || new Date().toISOString().split('T')[0];
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

      if (activeTasks.length > 0) {
        activeTasks.slice(0, 3).forEach((task: any) => {
          let startH = currentHour;
          let endH = currentHour + 2;
          
          if (startH === 12) {
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
            startTime: `${baseDateStr}T${String(startH).padStart(2, '0')}:00:00.000`,
            endTime: `${baseDateStr}T${String(endH).padStart(2, '0')}:00:00.000`,
            taskTitle: `Deep Work Focus: ${task.title}`
          });
          
          fallbackSessions.push({
            startTime: `${baseDateStr}T${String(endH).padStart(2, '0')}:00:00.000`,
            endTime: `${baseDateStr}T${String(endH).padStart(2, '0')}:30:00.000`,
            taskTitle: "Biological Buffer & Cognitive Recharge Slot"
          });

          currentHour = endH + 0.5;
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
        
        await AIDecision.create({
          userId,
          title: fallbackDecision.text,
          reason: fallbackDecision.reason,
          timestamp: new Date()
        });

        await DailyPlanModel.findOneAndUpdate(
          { userId, date: baseDateStr },
          { $set: { sessions: fallbackSessions.map(s => ({ taskId: "temp-task-id", taskTitle: s.taskTitle, startTime: s.startTime, endTime: s.endTime })), updatedAt: new Date() } },
          { upsert: true, new: true }
        );
      } catch (dbErr) {
        console.warn("Could not save programmatic fallback plan to MongoDB:", dbErr);
      }

      res.json({
        decision: fallbackDecision,
        plan: { sessions: fallbackSessions }
      });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // On Vercel, requests are routed to the exported handler below instead of a
  // listening port — Vercel sets VERCEL=1 in its build/runtime environment.
  if (process.env.VERCEL !== '1') {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

if (process.env.VERCEL !== '1') {
  appPromise.catch(err => console.error("Failed to start server:", err));
}

// Vercel's Node runtime calls this exported function per request instead of
// hitting a listening port. We wait for the one-time async setup (routes,
// Vite middleware in dev, etc.) to finish, then hand the request to Express.
export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}