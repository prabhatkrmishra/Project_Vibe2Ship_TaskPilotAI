import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import { GoogleGenAI } from "@google/genai";

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firestoreDb: any = null;
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    admin.initializeApp({
      projectId: config.projectId,
    });
    firestoreDb = getFirestore();
    console.log("Firebase Admin initialized");
  } catch (err) {
    console.error("Error initializing Firebase Admin", err);
  }
} else {
  console.warn('No firebase-applet-config.json found!');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  const verifyToken = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = await getAuth().verifyIdToken(token);
      req.uid = decoded.uid;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/firebase-config", (req, res) => {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
        measurementId: config.measurementId,
        databaseId: config.firestoreDatabaseId || '(default)'
      });
    } else {
      res.status(404).json({ error: "Config not found" });
    }
  });

  // --- AI Planning Routes ---
  
  app.post("/api/analyze-task", verifyToken, async (req: any, res: any) => {
    try {
      const { title, description, deadline } = req.body;
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
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });
      
      let text = response.text || "{}";
      // Clean up markdown block if present
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/generate-plan", verifyToken, async (req: any, res: any) => {
    try {
      const { tasks, date } = req.body;
      const prompt = `
        You are an autonomous AI planning assistant. 
        Generate an optimized daily schedule for this date: ${date}.
        
        Pending Tasks:
        ${JSON.stringify(tasks, null, 2)}
        
        Allocate realistic 1-2 hour work sessions. Prioritize high urgency tasks or tasks with looming deadlines.
        Assume standard working hours (9 AM - 6 PM).
        
        Return a JSON response exactly in this format, no markdown formatting:
        {
          "sessions": [
            {
              "taskId": "<id>",
              "taskTitle": "<title>",
              "startTime": "YYYY-MM-DDTHH:mm:ss.sssZ",
              "endTime": "YYYY-MM-DDTHH:mm:ss.sssZ"
            }
          ]
        }
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/chat", verifyToken, async (req: any, res: any) => {
    try {
      const { messages, context } = req.body;
      const prompt = `
        You are TaskPilot AI, an intelligent productivity executive assistant.
        The user is asking you for help.
        
        Current Context (Tasks): 
        ${JSON.stringify(context, null, 2)}
        
        Conversation History: ${JSON.stringify(messages, null, 2)}
        
        Respond conversationally, helpfully, and concisely. If they ask about their workload or what to do next, analyze the provided context.
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });
      
      res.json({ text: response.text });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/autonomous-pipeline", verifyToken, async (req: any, res: any) => {
    try {
      const { eventName, eventDetail, tasks } = req.body;
      const userId = req.uid;
      if (!firestoreDb) throw new Error("Firestore not initialized on server");

      const prompt = `
        You are an autonomous AI Productivity Agent.
        An event just occurred: "${eventName}"
        Details: "${eventDetail}"
        Current Time: ${new Date().toISOString()}
        
        Current pending tasks:
        ${JSON.stringify(tasks.map((t: any) => ({ title: t.title, priority: t.priority, estimatedHours: t.estimatedHours, riskScore: t.riskScore })))}
        
        You must:
        1. Reason about how this event affects the user's workload.
        2. Decide if a new optimized daily schedule is needed. If there are tasks, always create one.
        3. Formulate a concise decision log explaining what you observed, what you decided, and why.
        
        Return a JSON response exactly in this format (no markdown formatting):
        {
          "decision": {
            "text": "Short explanation of the adjustment",
            "type": "schedule",
            "reason": "Detailed reasoning"
          },
          "plan": {
            "sessions": [
              { "startTime": "YYYY-MM-DDTHH:mm:ss.sssZ", "endTime": "YYYY-MM-DDTHH:mm:ss.sssZ", "taskTitle": "Task Name" }
            ]
          }
        }
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      
      // Save decision to Firestore
      if (result.decision) {
        await firestoreDb.collection('users').doc(userId).collection('ai_decisions').add({
          ...result.decision,
          timestamp: new Date().toISOString()
        });
      }
      
      // Save plan to Firestore
      const todayDateStr = new Date().toISOString().split('T')[0];
      if (result.plan && result.plan.sessions && result.plan.sessions.length > 0) {
        await firestoreDb.collection('users').doc(userId).collection('daily_plan').doc(todayDateStr).set({
          ...result.plan,
          updatedAt: new Date().toISOString()
        });
      } else if (tasks.length === 0) {
        await firestoreDb.collection('users').doc(userId).collection('daily_plan').doc(todayDateStr).set({
          sessions: [],
          updatedAt: new Date().toISOString()
        });
      }

      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
