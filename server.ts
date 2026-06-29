import dotenv from "dotenv";
dotenv.config();

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
    const dbId = config.firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      firestoreDb = getFirestore(dbId);
    } else {
      firestoreDb = getFirestore();
    }
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
        .filter((m: any) => m.name && m.name.toLowerCase().includes("gemini") && !m.name.toLowerCase().includes("embed"));

      // If list is empty or doesn't have the key models, merge or use curated fallback
      if (formattedList.length === 0) {
        formattedList = [
          { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash (Default)" },
          { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash (Fast)" },
          { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
          { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)" }
        ];
      }

      res.json(formattedList);
    } catch (err: any) {
      console.error("Error listing models:", err);
      res.json([
        { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash (Default)" },
        { name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash (Fast)" },
        { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
        { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)" }
      ]);
    }
  });
  
  // --- Custom Google OAuth Routes (Using user-provided credentials) ---

  app.get("/api/auth/google/url", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured in .env" });
    }
    
    let appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    if (appUrl.endsWith('/')) {
      appUrl = appUrl.slice(0, -1);
    }
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/presentations"
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent"
    });

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  });

  app.get(["/api/auth/google/callback", "/api/auth/google/callback/"], async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is missing");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("Google OAuth credentials are not fully configured in .env");
    }

    let appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    if (appUrl.endsWith('/')) {
      appUrl = appUrl.slice(0, -1);
    }
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    try {
      // 1. Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("Token exchange failed:", errorText);
        return res.status(tokenRes.status).send(`Failed to exchange token: ${errorText}`);
      }

      const tokens = await tokenRes.json();
      const accessToken = tokens.access_token;
      
      // 2. Fetch User Profile
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) {
        return res.status(500).send("Failed to fetch user profile from Google");
      }

      const userInfo = await userRes.json();
      const { sub: googleUid, email, name, picture } = userInfo;

      // 4. Return HTML to notify parent window
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
                user: ${JSON.stringify({ email, name, picture, uid: googleUid })}
              };
              
              if (window.opener) {
                window.opener.postMessage(authData, '*');
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
  
  app.post("/api/analyze-task", verifyToken, async (req: any, res: any) => {
    try {
      const { title, description, deadline, model } = req.body;
      const selectedModel = model || "gemini-2.0-flash";
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
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      // Clean up markdown block if present
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "An unexpected error occurred.";
      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("429")) {
        errorMessage = "⚠️ Quota exceeded: You have exceeded your Gemini API rate limit or daily quota. Please choose another model from the select box above or try again later.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/generate-plan", verifyToken, async (req: any, res: any) => {
    try {
      const { tasks, date, model } = req.body;
      const selectedModel = model || "gemini-2.0-flash";
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
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "An unexpected error occurred.";
      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("429")) {
        errorMessage = "⚠️ Quota exceeded: You have exceeded your Gemini API rate limit or daily quota. Please choose another model from the select box above or try again later.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/chat", verifyToken, async (req: any, res: any) => {
    try {
      const { messages, context, model } = req.body;
      const selectedModel = model || "gemini-2.0-flash";
      const prompt = `
        You are TaskPilot AI, an intelligent productivity executive assistant.
        The user is asking you for help.
        
        Current Context (Tasks): 
        ${JSON.stringify(context, null, 2)}
        
        Conversation History: ${JSON.stringify(messages, null, 2)}
        
        Respond conversationally, helpfully, and concisely. If they ask about their workload or what to do next, analyze the provided context.
      `;
      
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt
      });
      
      res.json({ text: response.text });
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "An unexpected error occurred.";
      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("429")) {
        errorMessage = "⚠️ Quota exceeded: You have exceeded your Gemini API rate limit or daily quota. Please choose another model from the select box above or try again later.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/autonomous-pipeline", verifyToken, async (req: any, res: any) => {
    try {
      const { eventName, eventDetail, tasks, model } = req.body;
      const selectedModel = model || "gemini-2.0-flash";
      const userId = req.uid;
      if (!firestoreDb) {
        console.warn("Firestore not initialized on server. Fallback to client-side database saves.");
      }

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
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);
      
      // Save decision to Firestore
      if (result.decision && firestoreDb) {
        try {
          await firestoreDb.collection('users').doc(userId).collection('ai_decisions').add({
            ...result.decision,
            timestamp: new Date().toISOString()
          });
        } catch (dbErr) {
          console.warn("Could not save decision server-side, falling back to client-side save:", dbErr);
        }
      }
      
      // Save plan to Firestore
      const todayDateStr = new Date().toISOString().split('T')[0];
      if (firestoreDb) {
        try {
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
        } catch (dbErr) {
          console.warn("Could not save plan server-side, falling back to client-side save:", dbErr);
        }
      }

      res.json(result);
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "An unexpected error occurred.";
      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("429")) {
        errorMessage = "⚠️ Quota exceeded: You have exceeded your Gemini API rate limit or daily quota. Please choose another model from the select box above or try again later.";
      }
      res.status(500).json({ error: errorMessage });
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
