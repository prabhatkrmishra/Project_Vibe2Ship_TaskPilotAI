import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import * as fs from 'fs';
import * as crypto from 'crypto';
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { OpenRouter } from "@openrouter/sdk";
import { google } from "googleapis";
import { connectDB, User as UserSrc, Goal as GoalSrc, Task as TaskSrc, ChatMessage as ChatMessageSrc, AIDecision as AIDecisionSrc, DailyPlanModel as DailyPlanModelSrc, FocusSession as FocusSessionSrc } from "./src/db/mongodb.js";

const User = UserSrc as any;
const Goal = GoalSrc as any;
const Task = TaskSrc as any;
const ChatMessage = ChatMessageSrc as any;
const AIDecision = AIDecisionSrc as any;
const DailyPlanModel = DailyPlanModelSrc as any;
const FocusSessionModel = FocusSessionSrc as any;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  throw new Error(
    "JWT_SECRET environment variable is not set or too short (minimum 32 characters). " +
    "Set JWT_SECRET to a long, random value (e.g. `openssl rand -hex 32`)."
  );
}
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Token encryption at rest ──────────────────────────────────────────────────
// AES-256-GCM for encrypting sensitive fields (e.g. googleRefreshToken) in DB.
// Key derived from JWT_SECRET via PBKDF2 so no extra env var needed.
const ENCRYPTION_KEY = crypto.pbkdf2Sync(JWT_SECRET, 'taskpilot-token-encryption', 100_000, 32, 'sha512');

function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(cipherText: string): string {
  if (!cipherText || !cipherText.startsWith('enc:')) return cipherText;
  const [, ivHex, tagHex, dataHex] = cipherText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

// ─── Input sanitization ───────────────────────────────────────────────────────
// Strip HTML/script tags from user-provided strings to prevent stored XSS
// when values are rendered in server-generated HTML (e.g. OAuth callback pages).
function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

// Escape </script> sequences for safe embedding in <script> blocks via JSON.stringify
function safeJsonForScript(obj: any): string {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// ─── Multi-Provider AI System ─────────────────────────────────────────────────
// Supports Gemini (native SDK) + any OpenAI-compatible provider (Groq, NVIDIA NIM,
// OpenRouter, Together AI, DeepSeek, Mistral, Cerebras, Fireworks).
// Each provider is configured via env vars; models auto-route to the right client.

interface AIProvider {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: { id: string; displayName: string }[];
}

const AI_PROVIDERS: AIProvider[] = [
  {
    name: 'Google Gemini',
    baseUrl: '',
    apiKeyEnv: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Preview)' },
    ]
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B (Groq)' },
      { id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Groq)' },
      { id: 'llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout 17B (Groq)' },
      { id: 'llama-4-maverick-17b-128e-instruct', displayName: 'Llama 4 Maverick 17B (Groq)' },
      { id: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B (Groq)' },
      { id: 'gemma2-9b-it', displayName: 'Gemma 2 9B (Groq)' },
      { id: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek R1 70B (Groq)' },
    ]
  },
  {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NIM_API_KEY',
    models: [
      { id: 'deepseek-ai/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro (NIM)' },
      { id: 'minimaxai/minimax-m3', displayName: 'MiniMax M3 (NIM)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', displayName: 'Nemotron Ultra 550B (NIM)' },
      { id: 'stepfun-ai/step-3.7-flash', displayName: 'Step 3.7 Flash (NIM)' },
      { id: 'mistralai/mistral-medium-3.5-128b', displayName: 'Mistral Medium 3.5 (NIM)' },
    ]
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: [
      { id: 'tencent/hy3:free', displayName: 'Tencent Hy3 (OpenRouter Free)' },
      { id: 'poolside/laguna-xs-2.1:free', displayName: 'Poolside Laguna XS 2.1 (OpenRouter Free)' },
      { id: 'cohere/north-mini-code:free', displayName: 'Cohere North Mini Code (OpenRouter Free)' },
      { id: 'nvidia/nemotron-3.5-content-safety:free', displayName: 'Nemotron 3.5 Content Safety (OpenRouter Free)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', displayName: 'Nemotron 3 Ultra (OpenRouter Free)' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', displayName: 'Nemotron 3 Nano Omni (OpenRouter Free)' },
      { id: 'poolside/laguna-m.1:free', displayName: 'Poolside Laguna M.1 (OpenRouter Free)' },
      { id: 'google/gemma-4-26b-a4b-it:free', displayName: 'Gemma 4 26B A4B (OpenRouter Free)' },
      { id: 'google/gemma-4-31b-it:free', displayName: 'Gemma 4 31B (OpenRouter Free)' },
    ]
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.ai/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo (Together)' },
      { id: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3 (Together)' },
      { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', displayName: 'Qwen 3 235B (Together)' },
      { id: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503', displayName: 'Mistral Small 3.1 (Together)' },
    ]
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)' },
    ]
  },
  {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large-latest', displayName: 'Mistral Large (Mistral)' },
      { id: 'mistral-medium-latest', displayName: 'Mistral Medium (Mistral)' },
      { id: 'mistral-nemo', displayName: 'Mistral Nemo (Mistral)' },
      { id: 'open-mixtral-8x7b', displayName: 'Mixtral 8x7B (Mistral)' },
    ]
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    models: [
      { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B (Cerebras)' },
      { id: 'llama-3.1-8b', displayName: 'Llama 3.1 8B (Cerebras)' },
      { id: 'qwen-2.5-32b', displayName: 'Qwen 2.5 32B (Cerebras)' },
    ]
  },
  {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnv: 'FIREWORKS_API_KEY',
    models: [
      { id: 'accounts/fireworks/models/deepseek-v3', displayName: 'DeepSeek V3 (Fireworks)' },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', displayName: 'Llama 3.3 70B (Fireworks)' },
      { id: 'accounts/fireworks/models/qwen3-235b', displayName: 'Qwen 3 235B (Fireworks)' },
    ]
  },
];

// Build a flat lookup: modelId → provider (first provider wins for duplicates)
const MODEL_PROVIDER_MAP = new Map<string, AIProvider>();
for (const provider of AI_PROVIDERS) {
  for (const model of provider.models) {
    if (!MODEL_PROVIDER_MAP.has(model.id)) {
      MODEL_PROVIDER_MAP.set(model.id, provider);
    }
  }
}

function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini') || model.startsWith('models/gemini');
}

function getProviderForModel(model: string): AIProvider | undefined {
  // Check direct match
  if (MODEL_PROVIDER_MAP.has(model)) return MODEL_PROVIDER_MAP.get(model);
  // Check with models/ prefix stripped
  const stripped = model.replace(/^models\//, '');
  if (MODEL_PROVIDER_MAP.has(stripped)) return MODEL_PROVIDER_MAP.get(stripped);
  // Check if it looks like a gemini model
  if (isGeminiModel(model)) return MODEL_PROVIDER_MAP.get('gemini-3.5-flash');
  return undefined;
}

function getApiKeyForProvider(provider: AIProvider): string | undefined {
  return process.env[provider.apiKeyEnv];
}

// OpenAI-compatible chat completion via the openai SDK
async function openaiCompatChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: { type: string };
}): Promise<string> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseUrl,
    timeout: 300000, // 5 minutes — NIM cold starts can be slow
    maxRetries: 2,
  });

  const completion = await client.chat.completions.create({
    model: params.model,
    messages: params.messages as any,
    temperature: params.temperature ?? 0.7,
    top_p: params.topP ?? 0.95,
    max_tokens: params.maxTokens ?? 8192,
    stream: false,
    ...(params.responseFormat ? { response_format: params.responseFormat as any } : {}),
  });

  const content = completion.choices?.[0]?.message?.content ?? '';
  if (!content && completion.choices?.length) {
    console.warn(`[AI] Empty content from ${params.model}. Finish reason: ${completion.choices[0]?.finish_reason}`);
  }
  return content;
}

// OpenRouter chat completion via the official @openrouter/sdk
async function openrouterChat(params: {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: { type: string };
}): Promise<string> {
  const client = new OpenRouter({
    apiKey: params.apiKey,
    httpReferer: process.env.APP_URL || 'http://localhost:3000',
    appTitle: 'TaskPilot AI',
    timeoutMs: 300000,
  });

  const result = await client.chat.send({
    chatRequest: {
      model: params.model,
      messages: params.messages as any,
      temperature: params.temperature ?? 0.7,
      topP: params.topP ?? 0.95,
      maxTokens: params.maxTokens ?? 8192,
      stream: false,
      ...(params.responseFormat ? { responseFormat: params.responseFormat as any } : {}),
    },
  });

  const raw = result.choices?.[0]?.message?.content ?? '';
  const content = Array.isArray(raw)
    ? raw.map((item: any) => item?.text || '').join('')
    : typeof raw === 'string' ? raw
    : String(raw);
  if (!content && result.choices?.length) {
    console.warn(`[AI] Empty content from OpenRouter model ${params.model}.`);
  }
  return content;
}

// Unified content generation — routes to Gemini SDK or OpenAI-compatible provider
async function generateAIContent(params: {
  model: string;
  contents: any;
  config?: any;
}): Promise<{ text: string }> {
  const model = params.model;

  // ── Gemini path ──
  if (isGeminiModel(model)) {
    const response = await generateContentWithRetry(params);
    return { text: response.text || '' };
  }

  // ── OpenAI-compatible path ──
  const provider = getProviderForModel(model);
  if (!provider) {
    throw new Error(`Unknown AI model "${model}". No provider configured for this model.`);
  }

  const apiKey = getApiKeyForProvider(provider);
  if (!apiKey) {
    throw new Error(`API key not configured for ${provider.name}. Set ${provider.apiKeyEnv} in your .env file.`);
  }

  // Convert Gemini-style contents to OpenAI messages format
  let messages: { role: string; content: string }[] = [];
  if (typeof params.contents === 'string') {
    messages = [{ role: 'user', content: params.contents }];
  } else if (Array.isArray(params.contents)) {
    messages = params.contents.map((c: any) => ({
      role: c.role || 'user',
      content: typeof c.content === 'string' ? c.content
        : c.parts ? c.parts.map((p: any) => p.text || '').join('\n')
        : typeof c === 'string' ? c : JSON.stringify(c),
    }));
  } else if (params.contents?.parts) {
    // Gemini SDK format: { parts: [{ text: "..." }] }
    messages = [{ role: 'user', content: params.contents.parts.map((p: any) => p.text || '').join('\n') }];
  } else {
    messages = [{ role: 'user', content: JSON.stringify(params.contents) }];
  }

  // Determine response format from config
  let responseFormat: { type: string } | undefined;
  if (params.config?.responseMimeType === 'application/json') {
    responseFormat = { type: 'json_object' };
  }

  const maxRetries = 2;
  let delay = 1000;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = provider.name === 'OpenRouter'
        ? await openrouterChat({
            apiKey,
            model,
            messages,
            temperature: params.config?.temperature ?? 0.7,
            topP: params.config?.topP,
            maxTokens: params.config?.maxOutputTokens ?? 8192,
            responseFormat,
          })
        : await openaiCompatChat({
            baseUrl: provider.baseUrl,
            apiKey,
            model,
            messages,
            temperature: params.config?.temperature ?? 0.7,
            topP: params.config?.topP,
            maxTokens: params.config?.maxOutputTokens ?? 8192,
            responseFormat,
          });
      return { text };
    } catch (err: any) {
      lastError = err;
      const isQuotaError =
        err.statusCode === 429 ||
        (err.message && (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota') || err.message.includes('limit')));

      if (isQuotaError && attempt < maxRetries) {
        console.warn(`[AI] ${provider.name} rate limit hit for ${model} (attempt ${attempt + 1}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Validate/sanitize a model name. Strips "models/" prefix, maps deprecated Gemini
// models to current defaults, and validates against the known MODEL_PROVIDER_MAP.
function getValidModel(modelName: string | undefined): string {
  let model = modelName || "gemini-3.5-flash";
  model = model.replace(/^models\//, "");
  if (model.includes("gemini-2.0-flash") || model.includes("gemini-1.5") || model === "gemini-pro") {
    return "gemini-3.5-flash";
  }
  // If the model is in our provider map, it's valid. Otherwise fall back to default.
  if (!MODEL_PROVIDER_MAP.has(model)) {
    return "gemini-3.5-flash";
  }
  return model;
}

// Gemini-only retry wrapper (used by generateAIContent internally for Gemini models)
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
            attempt = 0;
            delay = 1000;
            continue;
          }
        }
        err.isQuotaExceeded = true;
        err.quotaModel = params.model;
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

  // --- Rate Limiters ────────────────────────────────────────────────────────────
  // S2: Rate limit auth endpoints to prevent brute-force / credential-stuffing.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,                   // 20 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Please try again later." },
  });
  const guestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,                    // 5 guest accounts per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many guest sessions. Please sign up or try again later." },
  });
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 min
    max: 30,                   // 30 messages per min per user
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.uid || req.ip,
    message: { error: "You're sending messages too fast. Slow down." },
  });

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

  // Helper: compute local date string (YYYY-MM-DD) from a Date, avoiding the
  // UTC-shift bug that occurs when using new Date().toISOString().split('T')[0].
  function localDateStr(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function processGamificationOnTaskComplete(userId: string, task: any) {
    try {
      // Read current state to compute streak/badges, then write atomically
      // with a condition on lastActiveDate to prevent lost concurrent updates.
      const user = await User.findOne({ _id: userId });
      if (!user) return null;
      
      let gamification = user.gamification || {
        currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
      };
      
      const today = localDateStr();
      const prevLastActiveDate = gamification.lastActiveDate;
      
      if (gamification.lastActiveDate !== today) {
        if (gamification.lastActiveDate) {
          const lastActive = new Date(gamification.lastActiveDate);
          const todayDate = new Date(today);
          const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
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
      
      let levelUp = null;
      while (gamification.xp >= gamification.level * 200) {
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
      
      // Atomic write: condition on lastActiveDate to prevent lost concurrent
      // streak/xp updates. If another request changed it between our read and
      // write, the update returns null and we skip gamification for this call.
      const updateResult = await User.findOneAndUpdate(
        { _id: userId, 'gamification.lastActiveDate': prevLastActiveDate },
        { $set: { gamification } },
        { new: true }
      );
      
      if (!updateResult) {
        console.warn("Gamification update skipped due to concurrent modification");
        return null;
      }
      
      return { xpEarned, newBadges, levelUp };
    } catch(e) {
      console.error("Gamification error:", e);
      return null;
    }
  }

  // Derive quest progress from its linked tasks. Called from every completion path
  // (session complete, direct task complete, subtask toggle) so quest progress never
  // drifts out of sync with reality.
  async function syncQuestProgress(userId: string, goalId: string) {
    try {
      const tasks = await Task.find({ userId, goalId });
      if (tasks.length === 0) return null;
      const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
      const progress = Math.round((completedCount / tasks.length) * 100);
      const isCompleted = progress === 100;
      const goal = await Goal.findOne({ _id: goalId, userId });
      if (!goal) return null;
      // Only update if something actually changed
      if (goal.progress === progress && goal.completed === isCompleted) return { progress, completed: isCompleted };
      const updateData: any = { progress };
      if (isCompleted && !goal.completed) {
        updateData.completed = true;
        updateData.completedAt = goal.completedAt || new Date().toISOString();
      } else if (!isCompleted) {
        updateData.completed = false;
        updateData.completedAt = null;
      }
      await Goal.findOneAndUpdate({ _id: goalId, userId }, { $set: updateData });
      return { progress, completed: isCompleted };
    } catch (e) {
      console.error("syncQuestProgress error:", e);
      return null;
    }
  }

  // Determine the scheduling mode for a task based on its subtasks and quest membership.
  // Must match the logic in generate-plan: only PACED_SUBTASKS when goal is type 'quest',
  // and only when there are incomplete subtasks remaining.
  async function getSchedulingMode(task: any): Promise<'WHOLE_TASK' | 'SAME_DAY_SUBTASKS' | 'PACED_SUBTASKS'> {
    const incompleteSubtasks = (task.subtasks || []).filter((st: any) => !st.completed);
    if (incompleteSubtasks.length === 0) return 'WHOLE_TASK';
    if (task.goalId) {
      const goal = await Goal.findOne({ _id: task.goalId, userId: task.userId });
      if (goal?.type === 'quest') return 'PACED_SUBTASKS';
    }
    return 'SAME_DAY_SUBTASKS';
  }

  // Award XP for completing a session (smaller than task completion XP).
  async function processGamificationOnSessionComplete(userId: string) {
    try {
      const user = await User.findOne({ _id: userId });
      if (!user) return null;
      let gamification = user.gamification || {
        currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: []
      };
      const today = localDateStr();
      const prevLastActiveDate = gamification.lastActiveDate;
      if (gamification.lastActiveDate !== today) {
        if (gamification.lastActiveDate) {
          const lastActive = new Date(gamification.lastActiveDate);
          const todayDate = new Date(today);
          const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
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
      // Small XP for session completion
      const xpEarned = 10;
      gamification.xp += xpEarned;
      let levelUp = null;
      while (gamification.xp >= gamification.level * 200) {
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

      // Atomic write with optimistic concurrency check on lastActiveDate
      const updateResult = await User.findOneAndUpdate(
        { _id: userId, 'gamification.lastActiveDate': prevLastActiveDate },
        { $set: { gamification } },
        { new: true }
      );
      if (!updateResult) {
        console.warn("Session gamification skipped due to concurrent modification");
        return null;
      }
      return { xpEarned, newBadges, levelUp };
    } catch (e) {
      console.error("Session gamification error:", e);
      return null;
    }
  }
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // ─── Data Backup / Restore (Google Drive) ─────────────────────────────────
  // Signing key used to HMAC-sign backup archives so tampered/foreign backups
  // can be detected before restore. This key never leaves the server.
  if (!process.env.BACKUP_SIGNING_KEY || process.env.BACKUP_SIGNING_KEY.trim().length === 0) {
    throw new Error(
      "BACKUP_SIGNING_KEY environment variable is not set. Refusing to start with an insecure default key. " +
      "Set BACKUP_SIGNING_KEY to a long, random value (e.g. `openssl rand -hex 32`)."
    );
  }
  const BACKUP_SIGNING_KEY = process.env.BACKUP_SIGNING_KEY;
  const BACKUP_FORMAT_VERSION = 1;

  function signBackupPayload(canonicalJson: string): string {
    return crypto.createHmac("sha256", BACKUP_SIGNING_KEY).update(canonicalJson).digest("hex");
  }

  function verifyBackupSignature(canonicalJson: string, signature: string): boolean {
    const expected = signBackupPayload(canonicalJson);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signature || ""), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Strips fields that must never leave the server in a backup: password
  // hashes, mongo internals, and anything auth/credential related.
  function sanitizeUserProfile(user: any) {
    if (!user) return null;
    return {
      email: user.email,
      name: user.name,
      picture: user.picture,
      address: user.address || "",
      gamification: getCorrectedGamification(user.gamification) || null,
    };
  }

  function stripMongoMeta(doc: any) {
    const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
    obj.id = obj._id ? obj._id.toString() : obj.id;
    delete obj._id;
    delete obj.__v;
    return obj;
  }

  // GET /api/backup/export — aggregates the full exportable dataset for the
  // authenticated user. Deliberately excludes anything credential-related
  // (password hash, OAuth tokens, JWTs).
  app.get("/api/backup/export", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const userId = req.uid;

      const [user, tasks, goals, plans, chats, aiDecisions, focusSessions] = await Promise.all([
        User.findById(userId),
        Task.find({ userId }).sort({ createdAt: -1 }),
        Goal.find({ userId }).sort({ createdAt: -1 }),
        DailyPlanModel.find({ userId }),
        ChatMessage.find({ userId }).sort({ timestamp: 1 }),
        AIDecision.find({ userId }).sort({ timestamp: -1 }),
        FocusSessionModel.find({ userId }).sort({ startedAt: -1 }),
      ]);

      const payload = {
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        profile: sanitizeUserProfile(user),
        tasks: tasks.map(stripMongoMeta),
        goals: goals.map(stripMongoMeta),
        dailyPlans: plans.map(stripMongoMeta),
        chats: chats.map(stripMongoMeta),
        aiDecisions: aiDecisions.map(stripMongoMeta),
        focusSessions: focusSessions.map(stripMongoMeta),
      };

      // Canonical JSON (stable key order) so the hash/signature are
      // reproducible regardless of object key insertion order upstream.
      const canonicalJson = JSON.stringify(payload);
      const contentHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

      res.json({ payload, canonicalJson, contentHash });
    } catch (error: any) {
      console.error("Backup export error:", error);
      res.status(500).json({ error: error.message || "Failed to export backup data" });
    }
  });

  // POST /api/backup/sign — signs an already-serialized backup payload.
  // Body: { canonicalJson: string }
  app.post("/api/backup/sign", verifyToken, async (req: any, res: any) => {
    try {
      const { canonicalJson } = req.body;
      if (!canonicalJson || typeof canonicalJson !== "string") {
        return res.status(400).json({ error: "canonicalJson (string) is required" });
      }
      const contentHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
      const signature = signBackupPayload(canonicalJson);
      res.json({ contentHash, signature });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to sign backup" });
    }
  });

  // POST /api/backup/verify — verifies a downloaded backup's signature
  // before it is restored. Body: { canonicalJson: string, signature: string }
  app.post("/api/backup/verify", verifyToken, async (req: any, res: any) => {
    try {
      const { canonicalJson, signature } = req.body;
      if (!canonicalJson || !signature) {
        return res.status(400).json({ valid: false, error: "canonicalJson and signature are required" });
      }
      const valid = verifyBackupSignature(canonicalJson, signature);
      res.json({ valid });
    } catch (error: any) {
      res.status(500).json({ valid: false, error: error.message || "Failed to verify backup" });
    }
  });

  // --- MongoDB Authentication Endpoints ---

  app.post(["/register/user", "/api/register/user", "/api/auth/register"], authLimiter, async (req, res) => {
    try {
      const { email, password, name, address } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: "Please provide email, password, and name" });
      }
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
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

  app.post("/api/auth/login", authLimiter, async (req, res) => {
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

      // ── 2FA: if enabled, return temp token instead of full JWT ──────────
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign(
          { uid: user._id.toString(), email: user.email, twoFA: true },
          JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({ requires2FA: true, tempToken });
      }

      // ── Login warning: detect new IP or device ──────────────────────────
      const currentIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      const currentDevice = (req.headers['user-agent'] || 'unknown').substring(0, 200);
      const knownIPs: string[] = user.knownIPs || [];
      const knownDevices: string[] = user.knownDevices || [];
      const isNewIP = !knownIPs.includes(currentIP);
      const isNewDevice = !knownDevices.includes(currentDevice);

      if (isNewIP || isNewDevice) {
        // Update known lists (cap at 50 each, FIFO)
        if (isNewIP) {
          knownIPs.push(currentIP);
          if (knownIPs.length > 50) knownIPs.shift();
          user.knownIPs = knownIPs;
        }
        if (isNewDevice) {
          knownDevices.push(currentDevice);
          if (knownDevices.length > 50) knownDevices.shift();
          user.knownDevices = knownDevices;
        }
        await user.save();
        // Send warning email (non-blocking)
        const { sendLoginWarningEmail } = await import('./src/lib/email.js');
        sendLoginWarningEmail(user.email, user.name, currentIP, currentDevice).catch(() => {});
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

  app.post("/api/auth/guest", guestLimiter, async (req, res) => {
    try {
      await connectDB();
      // S3: Cap total guest accounts to prevent DB bloat. Auto-prune guests older than 30 days.
      const GUEST_CAP = 500;
      const guestCount = await User.countDocuments({ isGuest: true });
      if (guestCount >= GUEST_CAP) {
        // Prune oldest 10% of guests to make room
        const pruneCount = Math.ceil(GUEST_CAP * 0.1);
        const oldestGuests = await User.find({ isGuest: true }).sort({ createdAt: 1 }).limit(pruneCount).select('_id');
        if (oldestGuests.length > 0) {
          const ids = oldestGuests.map((g: any) => g._id);
          await Promise.all([
            User.deleteMany({ _id: { $in: ids } }),
            Task.deleteMany({ userId: { $in: ids } }),
            Goal.deleteMany({ userId: { $in: ids } }),
            ChatMessage.deleteMany({ userId: { $in: ids } }),
            DailyPlanModel.deleteMany({ userId: { $in: ids } }),
            FocusSessionModel.deleteMany({ userId: { $in: ids } }),
          ]);
        }
      }
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
    
    const today = localDateStr();
    if (gamification.lastActiveDate && gamification.lastActiveDate !== today) {
      const lastActive = new Date(gamification.lastActiveDate);
      const todayDate = new Date(today);
      const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
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

  // Server-side price table — the client sends cost but we validate against this canonical map
  // to prevent tampering. Costs are in XP.
  const PERSONALITY_COSTS: Record<string, number> = {
    default: 0,
    drill_sergeant: 500,
    zen_guide: 1000,
    executive: 2000,
  };

  app.post("/api/user/personalities/unlock", verifyToken, async (req: any, res: any) => {
    try {
      const { personalityId } = req.body;
      const cost = PERSONALITY_COSTS[personalityId];
      if (cost === undefined) {
        return res.status(400).json({ error: "Unknown personality" });
      }
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
      
      if (!user.password) {
        return res.status(400).json({ error: "No local password set for this account" });
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

  // ─── Password Recovery ───────────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", authLimiter, async (req: any, res: any) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      await connectDB();
      const user = await User.findOne({ email: email.toLowerCase() });
      // Always return success to prevent user enumeration
      if (!user || user.authProvider === 'google' || !user.password) {
        return res.json({ message: "If an account with that email exists, a reset link has been sent." });
      }
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);
      user.passwordResetToken = hashedToken;
      user.passwordResetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      await user.save();
      // Send email (non-blocking)
      const { sendPasswordResetEmail } = await import('./src/lib/email.js');
      sendPasswordResetEmail(user.email, user.name, rawToken).catch(() => {});
      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/reset-password/:token", async (req: any, res: any) => {
    try {
      const { token } = req.params;
      if (!token) return res.status(400).json({ valid: false });
      await connectDB();
      // We need to scan users with a reset token and compare via bcrypt
      const users = await User.find({ passwordResetToken: { $exists: true, $ne: null } });
      let matchedUser: any = null;
      for (const u of users) {
        if (u.passwordResetExpiry && u.passwordResetExpiry > new Date()) {
          const match = await bcrypt.compare(token, u.passwordResetToken);
          if (match) { matchedUser = u; break; }
        }
      }
      if (!matchedUser) return res.json({ valid: false });
      res.json({ valid: true });
    } catch (error: any) {
      res.json({ valid: false });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req: any, res: any) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required" });
      if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
      await connectDB();
      const users = await User.find({ passwordResetToken: { $exists: true, $ne: null } });
      let matchedUser: any = null;
      for (const u of users) {
        if (u.passwordResetExpiry && u.passwordResetExpiry > new Date()) {
          const match = await bcrypt.compare(token, u.passwordResetToken);
          if (match) { matchedUser = u; break; }
        }
      }
      if (!matchedUser) return res.status(400).json({ error: "Invalid or expired reset token" });
      matchedUser.password = await bcrypt.hash(newPassword, 10);
      matchedUser.passwordResetToken = undefined;
      matchedUser.passwordResetExpiry = undefined;
      await matchedUser.save();
      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Two-Factor Authentication (TOTP) ───────────────────────────────────────
  app.post("/api/auth/2fa/status", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ enabled: !!user.twoFactorEnabled });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/2fa/setup", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.twoFactorEnabled) return res.status(400).json({ error: "2FA is already enabled. Disable it first." });
      const { generateTotpSecret, generateQrDataUrl } = await import('./src/lib/totp.js');
      const { secret, otpauthUrl } = generateTotpSecret(user.email);
      const qrCodeDataUrl = await generateQrDataUrl(otpauthUrl);
      // Store secret temporarily (not enabled yet until verified)
      user.twoFactorSecret = encryptToken(secret);
      await user.save();
      res.json({ secret, qrCodeDataUrl });
    } catch (error: any) {
      console.error("2FA setup error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/2fa/verify", verifyToken, async (req: any, res: any) => {
    try {
      const { code } = req.body;
      if (!code || code.length !== 6) return res.status(400).json({ error: "Please enter a 6-digit code" });
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.twoFactorSecret) return res.status(400).json({ error: "No 2FA setup in progress. Start setup first." });
      if (user.twoFactorEnabled) return res.status(400).json({ error: "2FA is already enabled." });
      const { verifyTotpCode } = await import('./src/lib/totp.js');
      const secret = decryptToken(user.twoFactorSecret);
      if (!verifyTotpCode(secret, code)) return res.status(400).json({ error: "Invalid code. Please try again." });
      user.twoFactorEnabled = true;
      await user.save();
      res.json({ message: "Two-factor authentication enabled successfully" });
    } catch (error: any) {
      console.error("2FA verify error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/2fa/disable", verifyToken, async (req: any, res: any) => {
    try {
      const { code } = req.body;
      if (!code || code.length !== 6) return res.status(400).json({ error: "Please enter a 6-digit code" });
      await connectDB();
      const user = await User.findById(req.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.twoFactorEnabled) return res.status(400).json({ error: "2FA is not enabled." });
      const { verifyTotpCode } = await import('./src/lib/totp.js');
      const secret = decryptToken(user.twoFactorSecret);
      if (!verifyTotpCode(secret, code)) return res.status(400).json({ error: "Invalid code." });
      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      await user.save();
      res.json({ message: "Two-factor authentication disabled" });
    } catch (error: any) {
      console.error("2FA disable error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/2fa/validate-login", authLimiter, async (req: any, res: any) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ error: "Temp token and code are required" });
      let payload: any;
      try {
        payload = jwt.verify(tempToken, JWT_SECRET) as any;
      } catch {
        return res.status(400).json({ error: "Invalid or expired session. Please log in again." });
      }
      if (!payload.twoFA || !payload.uid) return res.status(400).json({ error: "Invalid temp token" });
      await connectDB();
      const user = await User.findById(payload.uid);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({ error: "2FA is not enabled" });
      const { verifyTotpCode } = await import('./src/lib/totp.js');
      const secret = decryptToken(user.twoFactorSecret);
      if (!verifyTotpCode(secret, code)) return res.status(400).json({ error: "Invalid code" });
      // Issue full JWT
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
      console.error("2FA validate-login error:", error);
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

  // --- Quest Trail Endpoint ---
  // Returns completed sessions across all dates that reference tasks belonging to a
  // given quest. This powers the "Quest Trail" timeline — a chronological breadcrumb
  // of which subtasks got done on which days.
  app.get("/api/plans/trail/:goalId", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { goalId } = req.params;

      // Find all tasks linked to this quest
      const tasks = await Task.find({ userId: req.uid, goalId });
      const taskIds = new Set(tasks.map((t: any) => t._id.toString()));
      const taskTitleMap = new Map(tasks.map((t: any) => [t._id.toString(), t.title]));

      // Find all daily plans that have completed sessions referencing these tasks
      const plans = await DailyPlanModel.find({ userId: req.uid });
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

      // Sort by date then start time for chronological order
      trail.sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      res.json(trail);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Session Completion Endpoint ---
  // Single source of truth for completing a timetable session. Handles subtask-level
  // completion, task auto-completion, quest progress sync, and gamification — all
  // server-side so the state is consistent regardless of which surface the user
  // completes from.
  app.post("/api/plans/:date/complete-session", verifyToken, async (req: any, res: any) => {
    try {
      await connectDB();
      const { sessionIndex } = req.body;
      if (sessionIndex === undefined || sessionIndex === null) {
        return res.status(400).json({ error: "sessionIndex is required" });
      }

      const plan = await DailyPlanModel.findOne({ userId: req.uid, date: req.params.date });
      if (!plan) return res.status(404).json({ error: "No plan found for this date" });
      if (!Number.isInteger(sessionIndex) || sessionIndex < 0 || sessionIndex >= plan.sessions.length) {
        return res.status(400).json({ error: "Invalid session index" });
      }

      const session = plan.sessions[sessionIndex];
      const now = new Date().getTime();
      const end = new Date(session.endTime).getTime();
      const isPast = now > end;

      // Enforce completion rules: must be started or past end time
      if (!isPast && !session.started) {
        return res.status(400).json({ error: "Session cannot be completed yet — must be started or past its end time" });
      }

      // Guard against double-completing the same session
      if (session.completed) {
        return res.status(400).json({ error: "Session already completed" });
      }

      // Mark session as completed
      session.completed = true;
      session.started = true;
      await plan.save();

      let taskUpdate = null;
      let gamificationUpdates = null;
      let questSync = null;
      let sessionGamification = null;

      // If this session references a real task, update its state
      // Skip for routine/non-task sessions (temp-task-id or invalid ObjectIds)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(session.taskId || '');
      if (session.taskId && isValidObjectId) {
        const task = await Task.findOne({ _id: session.taskId, userId: req.uid });
        if (task) {
          const schedulingMode = session.schedulingMode || await getSchedulingMode(task);
          const coveredIds = new Set(session.subtaskIds || []);
          const hasSubtasks = task.subtasks && task.subtasks.length > 0;

          if (hasSubtasks && coveredIds.size > 0 && schedulingMode !== 'WHOLE_TASK') {
            // Subtask-level completion: mark only the covered subtasks
            const updatedSubtasks = task.subtasks.map((st: any) =>
              coveredIds.has(st.id) ? { ...st, completed: true } : st
            );
            const allSubtasksDone = updatedSubtasks.every((st: any) => st.completed);
            const newStatus = allSubtasksDone ? 'completed' : 'in_progress';
            const shouldAwardTaskGamification = allSubtasksDone && !task.hasBeenCompleted;

            await Task.findOneAndUpdate(
              { _id: task._id },
              { $set: { subtasks: updatedSubtasks, status: newStatus, ...(shouldAwardTaskGamification ? { hasBeenCompleted: true, completedAt: task.completedAt || new Date().toISOString() } : {}) } }
            );

            taskUpdate = { id: task._id.toString(), status: newStatus, subtasks: updatedSubtasks };

            // Award task-level gamification when task fully completes
            if (shouldAwardTaskGamification) {
              gamificationUpdates = await processGamificationOnTaskComplete(req.uid, task);
            }

            // Sync quest progress if task belongs to a quest
            if (task.goalId) {
              questSync = await syncQuestProgress(req.uid, task.goalId);
              // Award quest completion XP if quest just completed
              if (questSync?.completed) {
                const questUser = await User.findOne({ _id: req.uid });
                if (questUser) {
                  let g = questUser.gamification || { currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [] };
                  g.xp += 100;
                  while (g.xp >= g.level * 200) {
                    g.level += 1;
                  }
                  if (!g.earnedBadges) g.earnedBadges = [];
                  questUser.gamification = g;
                  questUser.markModified('gamification');
                  await questUser.save();
                }
              }
            }
          } else if (schedulingMode === 'WHOLE_TASK' || !hasSubtasks) {
            // Whole-task completion
            const shouldAwardGamification = !task.hasBeenCompleted;
            await Task.findOneAndUpdate(
              { _id: task._id },
              { $set: { status: 'completed', hasBeenCompleted: true, completedAt: task.completedAt || new Date().toISOString() } }
            );
            taskUpdate = { id: task._id.toString(), status: 'completed' };
            if (shouldAwardGamification) {
              gamificationUpdates = await processGamificationOnTaskComplete(req.uid, task);
            }
            if (task.goalId) {
              questSync = await syncQuestProgress(req.uid, task.goalId);
              if (questSync?.completed) {
                const questUser = await User.findOne({ _id: req.uid });
                if (questUser) {
                  let g = questUser.gamification || { currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [] };
                  g.xp += 100;
                  while (g.xp >= g.level * 200) {
                    g.level += 1;
                  }
                  if (!g.earnedBadges) g.earnedBadges = [];
                  questUser.gamification = g;
                  questUser.markModified('gamification');
                  await questUser.save();
                }
              }
            }
          }
        }
      }

      // Session-level gamification (small XP for completing any session)
      sessionGamification = await processGamificationOnSessionComplete(req.uid);

      const sessionObj = session.toObject ? session.toObject() : { ...session };
      res.json({
        session: sessionObj,
        taskUpdate,
        gamificationUpdates,
        questSync,
        sessionGamification
      });
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
      // Prevent overwriting ownership or immutable fields
      delete updateData.userId;
      delete updateData._id;
      delete updateData.createdAt;

      if (shouldAwardGamification) {
        updateData.hasBeenCompleted = true;
      }
      if (isNowCompleted) {
        updateData.completedAt = existingTask.completedAt || new Date().toISOString();
      } else if (req.body.status && req.body.status !== 'completed') {
        updateData.completedAt = null;
        updateData.hasBeenCompleted = false;
        if (existingTask.subtasks && existingTask.subtasks.length > 0) {
          updateData.subtasks = existingTask.subtasks.map((st: any) => ({ ...st, completed: false }));
        }
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
        // Pass the freshly-updated task from DB (not the formatted output obj)
        // so deadline and _id fields are correct for streak/gamification checks.
        gamificationUpdates = await processGamificationOnTaskComplete(req.uid, updatedTask);
      }

      // Sync quest progress if this task belongs to a quest
      let questSync = null;
      if (existingTask.goalId) {
        questSync = await syncQuestProgress(req.uid, existingTask.goalId);
        // Award quest completion XP if quest just completed
        if (questSync?.completed) {
          const questUser = await User.findOne({ _id: req.uid });
          if (questUser) {
            let g = questUser.gamification || { currentStreak: 0, longestStreak: 0, lastActiveDate: null, xp: 0, level: 1, totalTasksCompleted: 0, onTimeTasksCompleted: 0, earnedBadges: [] };
            g.xp += 100;
            while (g.xp >= g.level * 200) {
              g.level += 1;
            }
            if (!g.earnedBadges) g.earnedBadges = [];
            questUser.gamification = g;
            questUser.markModified('gamification');
            await questUser.save();
          }
        }
      }

      res.json({ ...obj, gamificationUpdates, questSync });
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
      const today = localDateStr();
      if (goal.lastLogged !== today) {
        const lastActive = new Date(goal.lastLogged);
        const todayDate = new Date(today);
        const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          goal.streak = 0;
        }
      }
    }
    // Time-based habit: auto-break streak if past scheduled time +5 min and not logged today
    if (goal.type === 'habit' && goal.scheduledTime && goal.lastLogged) {
      const today = localDateStr();
      if (goal.lastLogged !== today) {
        const [schedH, schedM] = goal.scheduledTime.split(':').map(Number);
        const now = new Date();
        const scheduledMinutes = schedH * 60 + schedM;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        if (currentMinutes > scheduledMinutes + 5) {
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
      delete updateData.userId;
      delete updateData._id;
      delete updateData.createdAt;
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
      const allModels: any[] = [];

      for (const provider of AI_PROVIDERS) {
        const hasKey = !!getApiKeyForProvider(provider);
        for (const model of provider.models) {
          allModels.push({
            name: model.id,
            displayName: model.displayName,
            provider: provider.name,
            available: hasKey,
          });
        }
      }

      // Also try to fetch live Gemini models and merge
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

        const geminiModels = modelsList
          .map((m: any) => ({
            name: (m.name || m.model || "").replace(/^models\//, ""),
            displayName: m.displayName || m.name?.split('/').pop() || m.name || "",
            provider: 'Google Gemini',
            available: !!process.env.GEMINI_API_KEY,
          }))
          .filter((m: any) => {
            const name = (m.name || "").toLowerCase();
            return name.includes("gemini") &&
                   !name.includes("embed") &&
                   !name.includes("gemini-2.0-flash") &&
                   !name.includes("gemini-1.5") &&
                   !name.includes("gemini-pro");
          });

        // Merge live Gemini models (replace curated ones if found)
        if (geminiModels.length > 0) {
          const curatedIds = new Set(geminiModels.map((m: any) => m.name));
          const filtered = allModels.filter(m => !(m.provider === 'Google Gemini' && curatedIds.has(m.name)));
          filtered.push(...geminiModels);
          allModels.length = 0;
          allModels.push(...filtered);
        }
      } catch {
        // Gemini list failed — curated list already included
      }

      res.json(allModels);
    } catch (err: any) {
      console.error("Error listing models:", err);
      // Return at least the curated list
      const fallback = AI_PROVIDERS.flatMap(p =>
        p.models.map(m => ({
          name: m.id,
          displayName: m.displayName,
          provider: p.name,
          available: !!getApiKeyForProvider(p),
        }))
      );
      res.json(fallback);
    }
  });
  
  app.get("/api/calendar/events", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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

  app.post("/api/calendar/events", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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

  app.post("/api/docs", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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

  app.post("/api/docs/generate-report", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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
        
        const aiRes = await generateAIContent({
          model: getValidModel(req.body.model),
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

  app.post("/api/presentations/generate", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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
        
        const aiRes = await generateAIContent({
          model: getValidModel(req.body.model),
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

  app.post("/api/sheets", verifyToken, async (req: any, res: any) => {
    try {
      const accessToken = req.headers["x-workspace-token"];
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
  app.post("/api/auth/google/callback", authLimiter, async (req, res) => {
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
      const { sub: googleUid, email, name: rawName, picture } = userInfo;
      const name = sanitizeHtml(rawName); // S1: strip HTML tags to prevent stored XSS
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
            currentUser.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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
            user.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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
              googleRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined, // S4: encrypt at rest
            });
          } else {
            user.authProvider = "google";
            user.googleId = googleUid;
            user.googleEmail = email.toLowerCase();
            if (picture && !user.picture) user.picture = picture;
            if (tokens.refresh_token) user.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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

  app.get(["/oauth2callback", "/oauth2callback/"], authLimiter, async (req, res) => {
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
      const { sub: googleUid, email, name: rawName, picture } = userInfo;
      const name = sanitizeHtml(rawName); // S1: strip HTML tags to prevent stored XSS
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
            currentUser.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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
            user.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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
              googleRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined, // S4: encrypt at rest
            });
          } else {
            user.authProvider = "google";
            user.googleId = googleUid;
            user.googleEmail = email.toLowerCase();
            if (picture && !user.picture) user.picture = picture;
            if (tokens.refresh_token) user.googleRefreshToken = encryptToken(tokens.refresh_token); // S4: encrypt at rest
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
                accessToken: ${safeJsonForScript(accessToken)},
                taskpilotToken: ${safeJsonForScript(taskpilotToken)},
                user: ${safeJsonForScript({ email: user.email, name: user.name, picture: user.picture, uid: user._id.toString() })}
              };

              if (window.opener) {
                window.opener.postMessage(authData, ${safeJsonForScript(targetOrigin)});
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
    const { title = '', description = '', targetDate = '', model = '' } = req.body || {};
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
      
      const response = await generateAIContent({
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
    const { title = '', description = '', deadline = '', model = '' } = req.body || {};
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
      
      const response = await generateAIContent({
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
    const { title = '', description = '', model = '' } = req.body || {};
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
      
      const response = await generateAIContent({
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
      
      const response = await generateAIContent({
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
            userId: req.uid,
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
    const { tasks = [], date = '', model = '' } = req.body || {};
    try {
      await connectDB();
      const selectedModel = getValidModel(model);

      const currentPlan = await DailyPlanModel.findOne({ userId: req.uid, date });
      if (!currentPlan || !currentPlan.sessions || currentPlan.sessions.length === 0) {
        return res.status(400).json({ error: "No timetable found for today. Please go to Timetable and generate a daily routine first." });
      }

      // --- Pacing feedback loop ---
      // Check yesterday's PACED_SUBTASKS sessions. If any were not completed, carry
      // those subtasks forward with a note so the AI bumps their priority today.
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = localDateStr(yesterday);
      const carryForward: { taskId: string; taskTitle: string; subtaskIds: string[] }[] = [];
      if (yesterdayStr !== date) {
        const yesterdayPlan = await DailyPlanModel.findOne({ userId: req.uid, date: yesterdayStr });
        if (yesterdayPlan?.sessions) {
          for (const s of yesterdayPlan.sessions) {
            if (s.schedulingMode === 'PACED_SUBTASKS' && !s.completed && s.subtaskIds?.length) {
              carryForward.push({ taskId: s.taskId, taskTitle: s.taskTitle, subtaskIds: s.subtaskIds });
            }
          }
        }
      }

      // Quest membership decides HOW a task's subtasks get scheduled, so it has to be resolved
      // server-side rather than left for the model to infer from raw task/goal ids:
      //   - Task has no subtasks              -> WHOLE_TASK: schedule the task itself into one slot.
      //   - Task has subtasks, no quest        -> SAME_DAY_SUBTASKS: it's a standalone task, so all
      //     of its incomplete subtasks must be scheduled TODAY.
      //   - Task has subtasks AND belongs to a
      //     quest (goal.type === 'quest')       -> PACED_SUBTASKS: the quest runs over a long
      //     period, so only schedule a small, reasonable slice of subtasks today — do NOT try to
      //     cram the whole task into one day.
      const goals = await Goal.find({ userId: req.uid });
      const questGoalById = new Map<string, any>(
        goals.filter((g: any) => g.type === 'quest').map((g: any) => [g._id.toString(), g])
      );

      const tasksForPrompt = (tasks || []).map((t: any) => {
        const incompleteSubtasks = (t.subtasks || []).filter((st: any) => !st.completed);
        const quest = t.goalId ? questGoalById.get(String(t.goalId)) : null;
        const schedulingMode = incompleteSubtasks.length === 0
          ? 'WHOLE_TASK'
          : quest
            ? 'PACED_SUBTASKS'
            : 'SAME_DAY_SUBTASKS';

        return {
          id: t.id,
          title: t.title,
          deadline: t.deadline,
          priority: t.priority,
          estimatedHours: t.estimatedHours,
          schedulingMode,
          questTargetDate: quest ? quest.targetDate : undefined,
          subtasks: incompleteSubtasks.map((st: any) => ({ id: st.id, title: st.title }))
        };
      });

      const prompt = `
        You are an autonomous AI planning assistant.
        Your job is to schedule the user's pending tasks into their EXISTING daily timetable, at SUBTASK granularity wherever a task has subtasks.
        ${carryForward.length > 0 ? `
        CARRY-FORWARD TASKS (HIGH PRIORITY — these were scheduled yesterday but not completed. They MUST be given slots today, before any other PACED_SUBTASKS work):
        ${JSON.stringify(carryForward, null, 2)}
        ` : ''}
        Pending Tasks — each one is pre-tagged with a "schedulingMode" you MUST follow exactly:
        ${JSON.stringify(tasksForPrompt, null, 2)}
        
        Current Timetable:
        ${JSON.stringify(currentPlan.sessions, null, 2)}
        
        SCHEDULING MODE DEFINITIONS (mandatory — do not deviate from a task's assigned mode):
        - "WHOLE_TASK": this task has no subtasks. Assign the task itself (not a subtask) to a single work slot, exactly like a normal task. Do not invent subtasks.
        - "SAME_DAY_SUBTASKS": this is a standalone task (not part of a quest) that has subtasks. It must be fully finishable today — distribute ALL of its listed incomplete subtasks across as many work slots as needed today, sized by how long each subtask likely takes relative to the task's total estimatedHours.
        - "PACED_SUBTASKS": this task belongs to a long-running quest (see its questTargetDate) made up of many tasks over a long period. Completing the whole task today is explicitly NOT the goal — completing ONE task per day across the quest's timeline is the goal. Schedule only a small, realistic slice of this task's subtasks today (typically just 1, or 2 only if it's a light day with many free work slots and few other tasks competing for them). Leave the rest of its subtasks unscheduled today so the quest's remaining tasks/subtasks can be paced out smoothly across the days remaining until questTargetDate — do not front-load or cram them.
        
        CRITICAL RULES:
        0. THE TIMETABLE STRUCTURE IS FIXED AND IMMUTABLE. Do NOT change the number of sessions, their start times, or end times.
        1. Identify slots in the timetable suitable for work (e.g., "Deep Work", "Focus", "Work Session", or generic activity blocks). Leave non-work slots (Lunch, Workout, Sleep, general Routine) exactly as they are — do not touch their taskTitle/subtaskIds.
        2. Never split one subtask across two slots. A single slot may cover exactly one subtask, or multiple small subtasks, depending on how much fits the slot's duration.
        3. ALLOCATION PRIORITY when work slots are limited: (a) SAME_DAY_SUBTASKS tasks first, since they must fully complete today; (b) WHOLE_TASK tasks next, ordered by nearest deadline/highest priority; (c) PACED_SUBTASKS tasks last, spreading any remaining slots across different quest tasks rather than exhausting all slots on one quest task.
        4. For every work slot you assign, set "taskId" to the parent task's id, "taskTitle" to EXACTLY the parent task's title (needed for progress tracking — do not alter it), and "subtaskIds" to an array of the subtask id(s) (from the list above) covered in that slot. For WHOLE_TASK assignments, set "subtaskIds" to an empty array.
        5. Return the full modified timetable in the exact same format, including untouched non-work slots and any work slots that remain unassigned (leave their existing taskTitle/subtaskIds untouched if nothing new fits).

        Return a JSON response exactly in this format, no markdown formatting:
        {
          "sessions": [
            {
              "taskId": "<id or temp-task-id>",
              "taskTitle": "<exact title of parent task, or original routine title for non-work slots>",
              "subtaskIds": ["<subtask id>", "..."],
              "startTime": "YYYY-MM-DDTHH:mm:ss.sss",
              "endTime": "YYYY-MM-DDTHH:mm:ss.sss"
            }
          ]
        }
      `;
      
      const response = await generateAIContent({
        model: selectedModel,
        contents: prompt
      });
      
      let text = response.text || "{}";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(text);

      if (result.sessions && Array.isArray(result.sessions)) {
        const normalizedResult = normalizeSessions(result.sessions);

        // Build a lookup of subtask id -> title (per task) so we can compose display labels
        // from just the scheduled subtask name(s) — without trusting the AI to echo titles
        // back verbatim.
        const subtaskTitleById = new Map<string, string>();
        for (const t of (tasks || [])) {
          for (const st of (t.subtasks || [])) {
            subtaskTitleById.set(st.id, st.title);
          }
        }

        // The AI is only supposed to slot tasks into the EXISTING, immutable timetable
        // (see prompt rule 0), but its response schema only carries taskId/taskTitle/
        // subtaskIds/startTime/endTime. Saving that verbatim would wipe every session's
        // completed/started progress flags. Instead, merge just the assignment fields back
        // onto the existing session objects (matched by original start/end time), and keep
        // every other existing field — including completed/started — intact.
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

          const subtaskIds: string[] = Array.isArray(match.subtaskIds) ? match.subtaskIds.filter((id: any) => subtaskTitleById.has(id)) : [];
          const subtaskTitles = subtaskIds.map((id) => subtaskTitleById.get(id)).filter(Boolean);
          // Session display naming follows the deepest level actually scheduled — never
          // concatenate parent + child names:
          //   - a subtask (or several) is scheduled in this slot -> show just the subtask name(s)
          //   - otherwise (WHOLE_TASK, whether the task belongs to a quest or is standalone)
          //     -> fall back to the task's own title (handled by the UI via
          //        `session.sessionLabel || session.taskTitle`), so no sessionLabel is set here.
          const sessionLabel = subtaskTitles.length > 0
            ? subtaskTitles.join(', ')
            : undefined;

          return {
            ...existing,
            taskId: match.taskId,
            taskTitle: match.taskTitle,
            subtaskIds,
            schedulingMode: tasksForPrompt.find((t: any) => t.id === match.taskId)?.schedulingMode || existing.schedulingMode,
            ...(sessionLabel ? { sessionLabel } : { sessionLabel: undefined })
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

  app.post("/api/chat", verifyToken, chatLimiter, async (req: any, res: any) => {
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
      
      const response = await generateAIContent({
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

      res.json({
        text: fallbackText,
        planUpdated: false,
        quotaExceeded: !!err?.isQuotaExceeded,
        quotaModel: err?.quotaModel,
      });
    }
  });

  app.post("/api/autonomous-pipeline", verifyToken, async (req: any, res: any) => {
    const userId = req.uid;
    const { eventName = '', eventDetail = '', tasks = [], model = '', dayDescription = '', localDateStr = '', localTimeStr = '' } = req.body || {};
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
      
      const response = await generateAIContent({
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

          // Preserve started/completed progress from the existing plan so that
          // "Customize Routine" doesn't wipe out active execution state.
          const existingPlan = await DailyPlanModel.findOne({ userId, date: todayDateStr });
          if (existingPlan && existingPlan.sessions?.length > 0) {
            // Build a lookup: sessions that were started or completed, keyed by
            // taskTitle + start time so we can match them to the new AI output.
            const progressMap = new Map<string, { started: boolean; completed: boolean }>();
            for (const es of existingPlan.sessions) {
              if (es.started || es.completed) {
                const key = `${es.taskTitle}__${es.startTime}`;
                progressMap.set(key, { started: !!es.started, completed: !!es.completed });
              }
            }
            // Merge progress back into the new sessions
            for (const ns of formattedSessions) {
              const key = `${ns.taskTitle}__${ns.startTime}`;
              const prev = progressMap.get(key);
              if (prev) {
                ns.started = prev.started;
                ns.completed = prev.completed;
              }
            }
          }

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

  // ─── Focus Zone Endpoints ──────────────────────────────────────────────────

  // POST /api/focus-sessions — log a completed focus session
  app.post("/api/focus-sessions", verifyToken, async (req: any, res: any) => {
    try {
      const userId = req.uid;
      const { method, taskTitle, taskId, startedAt, endedAt, plannedDuration, actualDuration, breaks, qualityRating, note, completed } = req.body;

      // Input validation
      if (!['pomodoro', 'flowtime', '52-17', 'ultradian', 'custom'].includes(method)) {
        return res.status(400).json({ error: "Invalid focus method" });
      }
      if (!startedAt || !endedAt) {
        return res.status(400).json({ error: "startedAt and endedAt are required" });
      }
      if (typeof actualDuration !== 'number' || actualDuration <= 0) {
        return res.status(400).json({ error: "actualDuration must be a positive number" });
      }
      if (actualDuration > 43200) { // 12 hours max
        return res.status(400).json({ error: "actualDuration exceeds maximum (12 hours)" });
      }
      if (qualityRating != null && (qualityRating < 1 || qualityRating > 5)) {
        return res.status(400).json({ error: "qualityRating must be between 1 and 5" });
      }

      const sessionDoc = await FocusSessionModel.create({
        userId, method, taskTitle, taskId, startedAt, endedAt,
        plannedDuration: plannedDuration || 0, actualDuration,
        breaks: breaks || 0, qualityRating, note, completed: completed !== false
      });

      // Normalize Mongoose document
      const sessionObj = sessionDoc.toObject();
      sessionObj.id = sessionObj._id.toString();
      delete sessionObj._id;
      delete sessionObj.__v;

      // ── Gamification ──────────────────────────────────────────────────────────
      const user = await User.findById(userId);
      if (user) {
        const gamification = user.gamification || {};

        // XP: base 15 + duration bonus + quality bonus + method bonus
        const durationMins = Math.round(actualDuration / 60);
        let xpEarned = 15;
        // Duration bonus: +1 per 10 minutes of focus
        xpEarned += Math.floor(durationMins / 10);
        // Quality bonus: +5 if rated 4+
        if (qualityRating && qualityRating >= 4) xpEarned += 5;
        // Method bonus: harder methods earn more
        const methodBonus: Record<string, number> = { ultradian: 5, '52-17': 3, pomodoro: 0, flowtime: 2, custom: 1 };
        xpEarned += methodBonus[method] || 0;
        // Streak multiplier: +10% per streak day (max +50%)
        const streakMultiplier = 1 + Math.min((gamification.focusStreak || 0) * 0.1, 0.5);
        xpEarned = Math.round(xpEarned * streakMultiplier);

        gamification.xp = (gamification.xp || 0) + xpEarned;
        gamification.totalFocusMinutes = (gamification.totalFocusMinutes || 0) + durationMins;
        gamification.focusSessionsCompleted = (gamification.focusSessionsCompleted || 0) + 1;

        // Focus streak: use DEDICATED focusLastActiveDate (not shared lastActiveDate)
        const today = new Date().toISOString().slice(0, 10);
        const focusLastActive = gamification.focusLastActiveDate;
        if (focusLastActive) {
          const lastDate = new Date(focusLastActive + "T00:00:00Z");
          const todayDate = new Date(today + "T00:00:00Z");
          const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            gamification.focusStreak = (gamification.focusStreak || 0) + 1;
          } else if (diffDays > 1) {
            gamification.focusStreak = 1;
          }
          // same day: no change to streak
        } else {
          gamification.focusStreak = 1;
        }
        gamification.focusLastActiveDate = today;
        if ((gamification.focusStreak || 0) > (gamification.longestFocusStreak || 0)) {
          gamification.longestFocusStreak = gamification.focusStreak;
        }

        // Level-up check
        let levelUp = null;
        while (gamification.xp >= (gamification.level || 1) * 200) {
          gamification.level = (gamification.level || 1) + 1;
          levelUp = gamification.level;
        }

        // Focus badges
        const newBadges: string[] = [];
        const checkBadge = (id: string, condition: boolean) => {
          if (condition && !(gamification.earnedBadges || []).includes(id)) {
            gamification.earnedBadges = gamification.earnedBadges || [];
            gamification.earnedBadges.push(id);
            newBadges.push(id);
          }
        };
        checkBadge('focus_3', (gamification.focusStreak || 0) >= 3);
        checkBadge('focus_7', (gamification.focusStreak || 0) >= 7);
        checkBadge('focus_30', (gamification.focusStreak || 0) >= 30);
        checkBadge('focus_100', (gamification.focusStreak || 0) >= 100);
        // Session count badges
        checkBadge('focus_10_sessions', (gamification.focusSessionsCompleted || 0) >= 10);
        checkBadge('focus_50_sessions', (gamification.focusSessionsCompleted || 0) >= 50);
        checkBadge('focus_100_sessions', (gamification.focusSessionsCompleted || 0) >= 100);
        // Total time badges
        checkBadge('focus_10_hours', (gamification.totalFocusMinutes || 0) >= 600);
        checkBadge('focus_100_hours', (gamification.totalFocusMinutes || 0) >= 6000);

        user.gamification = gamification;
        await user.save();

        return res.json({
          session: sessionObj,
          gamification: { xpEarned, newBadges, levelUp, focusStreak: gamification.focusStreak }
        });
      }

      res.json({ session: sessionObj, gamification: null });
    } catch (e: any) {
      console.error("Focus session save error:", e);
      res.status(500).json({ error: e.message || "Failed to save focus session" });
    }
  });

  // GET /api/focus-sessions/stats — aggregated focus statistics
  // NOTE: Defined BEFORE the generic /api/focus-sessions route so Express
  // matches the more specific path first.
  app.get("/api/focus-sessions/stats", verifyToken, async (req: any, res: any) => {
    try {
      const userId = req.uid;
      const now = new Date();
      // Use local date for today
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Week start: Monday (handles Sunday correctly)
      const weekStart = new Date(now);
      const dayOfWeek = now.getDay(); // 0=Sun
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(now.getDate() - daysSinceMonday);
      weekStart.setHours(0, 0, 0, 0);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Limit query to last 365 days for performance
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const allSessions = await FocusSessionModel.find({ userId, startedAt: { $gte: yearAgo } }).sort({ startedAt: -1 });

      let todayMinutes = 0, todaySessions = 0;
      let weekMinutes = 0, weekSessions = 0;
      let monthMinutes = 0, monthSessions = 0;
      // Initialize all method keys
      const byMethod: Record<string, number> = { pomodoro: 0, flowtime: 0, '52-17': 0, ultradian: 0, custom: 0 };
      const heatmap: Record<string, number> = {};
      const dailyWeek: Record<string, number> = {};

      for (const s of allSessions) {
        const mins = Math.round((s.actualDuration || 0) / 60);
        const sDate = new Date(s.startedAt);
        // Use local date string for consistent comparison
        const sDay = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;

        // Method breakdown
        if (byMethod.hasOwnProperty(s.method)) {
          byMethod[s.method] += mins;
        } else {
          byMethod[s.method] = mins;
        }

        // Heatmap (all-time)
        heatmap[sDay] = (heatmap[sDay] || 0) + mins;

        // Today
        if (sDay === todayStr) {
          todayMinutes += mins;
          todaySessions += 1;
        }
        // This week
        if (sDate >= weekStart) {
          weekMinutes += mins;
          weekSessions += 1;
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayLabel = dayNames[sDate.getDay()];
          dailyWeek[dayLabel] = (dailyWeek[dayLabel] || 0) + mins;
        }
        // This month
        if (sDate >= monthStart) {
          monthMinutes += mins;
          monthSessions += 1;
        }
      }

      // Focus streak from gamification (uses dedicated focusLastActiveDate)
      const user = await User.findById(userId);
      const focusStreak = user?.gamification?.focusStreak || 0;
      const longestFocusStreak = user?.gamification?.longestFocusStreak || 0;
      const totalFocusMinutes = user?.gamification?.totalFocusMinutes || 0;
      const totalFocusSessions = user?.gamification?.focusSessionsCompleted || 0;

      res.json({
        todayMinutes, todaySessions,
        weekMinutes, weekSessions,
        monthMinutes, monthSessions,
        focusStreak, longestFocusStreak,
        totalFocusMinutes, totalFocusSessions,
        byMethod, heatmap, dailyWeek
      });
    } catch (e: any) {
      console.error("Focus stats error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch focus stats" });
    }
  });

  // GET /api/focus-sessions/heatmap — monthly heatmap data
  app.get("/api/focus-sessions/heatmap", verifyToken, async (req: any, res: any) => {
    try {
      const userId = req.uid;
      const { month } = req.query;
      const now = new Date();
      const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Validate month format
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        return res.status(400).json({ error: "Invalid month format. Use YYYY-MM." });
      }

      const [year, mon] = targetMonth.split('-').map(Number);
      if (isNaN(year) || isNaN(mon) || mon < 1 || mon > 12) {
        return res.status(400).json({ error: "Invalid month values." });
      }

      const monthStart = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

      const sessions = await FocusSessionModel.find({
        userId,
        startedAt: { $gte: monthStart, $lte: monthEnd }
      });

      const heatmap: Record<string, number> = {};
      for (const s of sessions) {
        const d = new Date(s.startedAt);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        heatmap[day] = (heatmap[day] || 0) + Math.round((s.actualDuration || 0) / 60);
      }

      res.json({ month: targetMonth, heatmap });
    } catch (e: any) {
      console.error("Focus heatmap error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch heatmap" });
    }
  });

  // GET /api/focus-sessions — fetch focus history with optional filters
  // NOTE: This generic route MUST come after /stats and /heatmap so those
  // specific paths are matched first by Express.
  app.get("/api/focus-sessions", verifyToken, async (req: any, res: any) => {
    try {
      const userId = req.uid;
      const { from, to, method, limit: limitStr } = req.query;
      const filter: any = { userId };
      if (method) filter.method = method;
      if (from || to) {
        filter.startedAt = {};
        if (from) filter.startedAt.$gte = new Date(from);
        if (to) filter.startedAt.$lte = new Date(to);
      }
      const rawSessions = await FocusSessionModel.find(filter)
        .sort({ startedAt: -1 })
        .limit(parseInt(limitStr) || 100);
      // Normalize Mongoose documents
      const sessions = rawSessions.map((s: any) => {
        const obj = s.toObject();
        obj.id = obj._id.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      });
      res.json({ sessions });
    } catch (e: any) {
      console.error("Focus sessions fetch error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch focus sessions" });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import: keeps 'vite' (and its rollup native binary dependency)
    // out of the production code path entirely. A static top-level import
    // would load vite/rollup on every environment, including production,
    // which crashed the Vercel serverless function with
    // "Cannot find module '@rollup/rollup-linux-x64-gnu'" since vite is
    // never actually needed once we're serving the prebuilt dist/ folder.
    const { createServer: createViteServer } = await import("vite");
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