import dotenv from "dotenv";

dotenv.config();

import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import * as fs from 'fs';
import * as crypto from 'crypto';
import rateLimit, {ipKeyGenerator} from "express-rate-limit";
import {OAuth2Client} from "google-auth-library";
import {GoogleGenAI} from "@google/genai";
import OpenAI from "openai";
import {OpenRouter} from "@openrouter/sdk";
import {google} from "googleapis";
import {
    connectDB,
    User as UserSrc,
    Goal as GoalSrc,
    Task as TaskSrc,
    ChatMessage as ChatMessageSrc,
    AIDecision as AIDecisionSrc,
    DailyPlanModel as DailyPlanModelSrc,
    FocusSession as FocusSessionSrc,
    AIUsage as AIUsageSrc,
    PricingConfig as PricingConfigSrc,
    AIAction as AIActionSrc,
    DopamineMenuItem as DopamineMenuItemSrc,
    BurnoutSignal as BurnoutSignalSrc,
    EnergyLog as EnergyLogSrc,
    KnowledgeEntity as KnowledgeEntitySrc,
    KnowledgeEdge as KnowledgeEdgeSrc,
    IntegrationConnection as IntegrationConnectionSrc,
    PersonalAccessToken as PersonalAccessTokenSrc
} from "./src/db/mongodb.js";

const User = UserSrc as any;
const Goal = GoalSrc as any;
const Task = TaskSrc as any;
const ChatMessage = ChatMessageSrc as any;
const AIDecision = AIDecisionSrc as any;
const DailyPlanModel = DailyPlanModelSrc as any;
const FocusSessionModel = FocusSessionSrc as any;
const AIUsage = AIUsageSrc as any;
const PricingConfig = PricingConfigSrc as any;
const AIAction = AIActionSrc as any;
const DopamineMenuItemModel = DopamineMenuItemSrc as any;
const BurnoutSignal = BurnoutSignalSrc as any;
const EnergyLog = EnergyLogSrc as any;
const KnowledgeEntity = KnowledgeEntitySrc as any;
const KnowledgeEdge = KnowledgeEdgeSrc as any;
const IntegrationConnection = IntegrationConnectionSrc as any;
const PersonalAccessTokenModel = PersonalAccessTokenSrc as any;

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
            {id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash'},
            {id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite'},
            {id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Preview)'},
        ]
    },
    {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEnv: 'GROQ_API_KEY',
        models: [
            {id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B (Groq)'},
            {id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Groq)'},
            {id: 'llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout 17B (Groq)'},
            {id: 'llama-4-maverick-17b-128e-instruct', displayName: 'Llama 4 Maverick 17B (Groq)'},
            {id: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B (Groq)'},
            {id: 'gemma2-9b-it', displayName: 'Gemma 2 9B (Groq)'},
            {id: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek R1 70B (Groq)'},
        ]
    },
    {
        name: 'NVIDIA NIM',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        apiKeyEnv: 'NIM_API_KEY',
        models: [
            {id: 'deepseek-ai/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro (NIM)'},
            {id: 'minimaxai/minimax-m3', displayName: 'MiniMax M3 (NIM)'},
            {id: 'nvidia/nemotron-3-ultra-550b-a55b', displayName: 'Nemotron Ultra 550B (NIM)'},
            {id: 'stepfun-ai/step-3.7-flash', displayName: 'Step 3.7 Flash (NIM)'},
            {id: 'mistralai/mistral-medium-3.5-128b', displayName: 'Mistral Medium 3.5 (NIM)'},
        ]
    },
    {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        models: [
            {id: 'tencent/hy3:free', displayName: 'Tencent Hy3 (OpenRouter Free)'},
            {id: 'poolside/laguna-xs-2.1:free', displayName: 'Poolside Laguna XS 2.1 (OpenRouter Free)'},
            {id: 'cohere/north-mini-code:free', displayName: 'Cohere North Mini Code (OpenRouter Free)'},
            {
                id: 'nvidia/nemotron-3.5-content-safety:free',
                displayName: 'Nemotron 3.5 Content Safety (OpenRouter Free)'
            },
            {id: 'nvidia/nemotron-3-ultra-550b-a55b:free', displayName: 'Nemotron 3 Ultra (OpenRouter Free)'},
            {
                id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
                displayName: 'Nemotron 3 Nano Omni (OpenRouter Free)'
            },
            {id: 'poolside/laguna-m.1:free', displayName: 'Poolside Laguna M.1 (OpenRouter Free)'},
            {id: 'google/gemma-4-26b-a4b-it:free', displayName: 'Gemma 4 26B A4B (OpenRouter Free)'},
            {id: 'google/gemma-4-31b-it:free', displayName: 'Gemma 4 31B (OpenRouter Free)'},
        ]
    },
    {
        name: 'Together AI',
        baseUrl: 'https://api.together.ai/v1',
        apiKeyEnv: 'TOGETHER_API_KEY',
        models: [
            {id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo (Together)'},
            {id: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3 (Together)'},
            {id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', displayName: 'Qwen 3 235B (Together)'},
            {id: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503', displayName: 'Mistral Small 3.1 (Together)'},
        ]
    },
    {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        models: [
            {id: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)'},
            {id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)'},
        ]
    },
    {
        name: 'Mistral AI',
        baseUrl: 'https://api.mistral.ai/v1',
        apiKeyEnv: 'MISTRAL_API_KEY',
        models: [
            {id: 'mistral-large-latest', displayName: 'Mistral Large (Mistral)'},
            {id: 'mistral-medium-latest', displayName: 'Mistral Medium (Mistral)'},
            {id: 'mistral-nemo', displayName: 'Mistral Nemo (Mistral)'},
            {id: 'open-mixtral-8x7b', displayName: 'Mixtral 8x7B (Mistral)'},
        ]
    },
    {
        name: 'Cerebras',
        baseUrl: 'https://api.cerebras.ai/v1',
        apiKeyEnv: 'CEREBRAS_API_KEY',
        models: [
            {id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B (Cerebras)'},
            {id: 'llama-3.1-8b', displayName: 'Llama 3.1 8B (Cerebras)'},
            {id: 'qwen-2.5-32b', displayName: 'Qwen 2.5 32B (Cerebras)'},
        ]
    },
    {
        name: 'Fireworks AI',
        baseUrl: 'https://api.fireworks.ai/inference/v1',
        apiKeyEnv: 'FIREWORKS_API_KEY',
        models: [
            {id: 'accounts/fireworks/models/deepseek-v3', displayName: 'DeepSeek V3 (Fireworks)'},
            {id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', displayName: 'Llama 3.3 70B (Fireworks)'},
            {id: 'accounts/fireworks/models/qwen3-235b', displayName: 'Qwen 3 235B (Fireworks)'},
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
        ...(params.responseFormat ? {response_format: params.responseFormat as any} : {}),
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
        httpReferer: process.env.FRONTEND_URL || 'http://localhost:3000',
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
            ...(params.responseFormat ? {responseFormat: params.responseFormat as any} : {}),
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
        return {text: response.text || ''};
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
        messages = [{role: 'user', content: params.contents}];
    } else if (Array.isArray(params.contents)) {
        messages = params.contents.map((c: any) => ({
            role: c.role || 'user',
            content: typeof c.content === 'string' ? c.content
                : c.parts ? c.parts.map((p: any) => p.text || '').join('\n')
                    : typeof c === 'string' ? c : JSON.stringify(c),
        }));
    } else if (params.contents?.parts) {
        // Gemini SDK format: { parts: [{ text: "..." }] }
        messages = [{role: 'user', content: params.contents.parts.map((p: any) => p.text || '').join('\n')}];
    } else {
        messages = [{role: 'user', content: JSON.stringify(params.contents)}];
    }

    // Determine response format from config
    let responseFormat: { type: string } | undefined;
    if (params.config?.responseMimeType === 'application/json') {
        responseFormat = {type: 'json_object'};
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
            return {text};
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
// and drops any session that is still malformed (missing/unparseable/zero-length).
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

            return {...s, endTime};
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
    app.set('trust proxy', 1);
    const PORT = 3000;

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    // In prod we still want helmet's other protections, but its *default* CSP
    // (script-src 'self') blocks every third-party script this app legitimately
    // loads at runtime: Google Identity Services (accounts.google.com/gsi/client),
    // the legacy gapi loader (apis.google.com/js/api.js), and the Razorpay
    // checkout widget (checkout.razorpay.com/v1/checkout.js) — plus the popup/
    // iframe those two open. Passing `undefined` here (previous behavior) silently
    // fell back to that default and broke Google login + payments in production
    // only, since dev disables CSP entirely and never caught it.
    /*app.use(helmet(isProd ? {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "https://accounts.google.com",
                    "https://apis.google.com",
                    "https://checkout.razorpay.com",
                ],
                scriptSrcElem: [
                    "'self'",
                    "https://accounts.google.com",
                    "https://apis.google.com",
                    "https://checkout.razorpay.com",
                ],
                connectSrc: [
                    "'self'",
                    "https://accounts.google.com",
                    "https://www.googleapis.com",
                    "https://oauth2.googleapis.com",
                    "https://api.razorpay.com",
                    "https://lumberjack.razorpay.com",
                ],
                frameSrc: [
                    "'self'",
                    "https://accounts.google.com",
                    "https://content.googleapis.com",
                    "https://api.razorpay.com",
                    "https://checkout.razorpay.com",
                ],
                imgSrc: ["'self'", "data:", "https:"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'", "data:", "https:"],
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: {policy: "cross-origin"},
        crossOriginOpenerPolicy: {policy: "same-origin-allow-popups"}, // needed for the Google OAuth popup flow to postMessage back to window.opener
    } : {
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginOpenerPolicy: false,
        frameguard: false,
    }));*/
    app.use(
        helmet({
            contentSecurityPolicy: false,
            xDownloadOptions: false,
        }),
    );
    app.use(cors({
        origin: function (origin, callback) {
            const allowed = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').filter(Boolean);
            if (allowed.length === 0 || !origin || allowed.includes(origin) || allowed.includes('*')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
    }));
    app.use(express.json({
        limit: '1mb', verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        }
    }));

    // --- Rate Limiters ────────────────────────────────────────────────────────────
    // S2: Rate limit auth endpoints to prevent brute-force / credential-stuffing.
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 min
        max: 20,                   // 20 attempts per window per IP
        standardHeaders: true,
        legacyHeaders: false,
        message: {error: "Too many authentication attempts. Please try again later."},
    });
    const guestLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,                    // 5 guest accounts per IP per hour
        standardHeaders: true,
        legacyHeaders: false,
        message: {error: "Too many guest sessions. Please sign up or try again later."},
    });
    const chatLimiter = rateLimit({
        windowMs: 60 * 1000,      // 1 min
        max: 30,                   // 30 messages per min per user
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
        message: {error: "You're sending messages too fast. Slow down."},
    });
    const paymentLimiter = rateLimit({
        windowMs: 60 * 1000,      // 1 min
        max: 10,                   // 10 payment actions per min per user
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
        message: {error: "Too many payment requests. Please try again later."},
    });
    const emailLimiter = rateLimit({
        windowMs: 60 * 1000,      // 1 min
        max: 3,                    // 3 emails per min per user
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
        message: {error: "Too many emails. Please try again later."},
    });

    // Sanitize error messages to avoid leaking DB internals to clients
    const safeError = (err: any): string => {
        const msg = String(err?.message || err || 'Internal server error');
        if (msg.includes('Mongo') || msg.includes('E11000') || msg.includes('buffering') ||
            msg.includes('CastError') || msg.includes('ValidationError') || msg.includes('connection')) {
            return 'An internal error occurred. Please try again.';
        }
        return msg.slice(0, 200);
    };

    // Max input sizes for AI endpoints (characters)
    const MAX_INPUT = {chat: 20000, journal: 10000, plan: 15000, quest: 5000, analyze: 5000} as const;

    // --- Tier-Aware AI Usage Limits ---
    const TIER_LIMITS: Record<'free' | 'pro' | 'pro_plus', Record<string, number>> = {
        free: {
            '/api/chat': 20,
            '/api/autonomous-pipeline': 1,
            '/api/generate-plan': 3,
            '/api/generate-quest-steps': 5,
            '/api/analyze-task': 5,
            '/api/generate-subtasks': 5,
            '/api/audio-journal': 2,
            '/api/docs/generate-report': 1,
            '/api/presentations/generate': 1,
            '/api/tasks/micro-steps': 20,
        },
        pro: {
            '/api/chat': 200,
            '/api/generate-plan': 50,
            '/api/generate-quest-steps': 50,
            '/api/analyze-task': 50,
            '/api/generate-subtasks': 50,
            '/api/audio-journal': 20,
            '/api/docs/generate-report': 10,
            '/api/presentations/generate': 10,
            '/api/tasks/micro-steps': 100,
        },
        pro_plus: {},
    };

    const FEATURE_TIER_REQUIREMENT: Record<string, 'pro' | 'pro_plus'> = {
        '/api/autonomous-pipeline': 'pro_plus',
    };

    const DAILY_FAIR_USE_CAP = 500;

    function resolveTier(user: any): 'free' | 'pro' | 'pro_plus' {
        const now = new Date();
        if (user.tierExpiry && user.tierExpiry < now) return 'free';
        return (user.tier || 'free') as 'free' | 'pro' | 'pro_plus';
    }

    function tierFromPlan(plan: string): 'pro' | 'pro_plus' {
        return plan.includes('pro_plus') ? 'pro_plus' : 'pro';
    }

    // Phase 3.1 — Compute velocity profile: actual-to-estimated ratio per category
    async function getUserVelocityProfile(userId: string): Promise<Map<string, number>> {
        const completedTasks = await Task.find({
            userId,
            status: 'completed',
            estimatedHours: {$gt: 0},
            completedAt: {$ne: null}
        }).select('category estimatedHours createdAt completedAt');

        const categoryData: Record<string, { totalActual: number; totalEstimated: number; count: number }> = {};
        for (const t of completedTasks) {
            const cat = t.category || 'Uncategorized';
            if (!categoryData[cat]) categoryData[cat] = {totalActual: 0, totalEstimated: 0, count: 0};
            const actualMs = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
            const actualHours = actualMs / (1000 * 60 * 60);
            if (actualHours > 0) {
                categoryData[cat].totalActual += actualHours;
                categoryData[cat].totalEstimated += t.estimatedHours;
                categoryData[cat].count++;
            }
        }

        const profile = new Map<string, number>();
        for (const [cat, data] of Object.entries(categoryData)) {
            if (data.count >= 3) {
                profile.set(cat, data.totalActual / data.totalEstimated);
            }
        }
        return profile;
    }

    // Phase 2.1 — Compute energy profile from logs or infer from FocusSession data
    async function computeEnergyProfile(userId: string): Promise<{ peakWindows: string[], lowWindows: string[] }> {
        const logs = await EnergyLog.find({userId}).sort({date: -1}).limit(60);
        if (logs.length >= 6) {
            const byPeriod: Record<string, number[]> = {morning: [], afternoon: [], evening: [], night: []};
            logs.forEach((l: any) => {
                byPeriod[l.timeOfDay]?.push(l.energyLevel);
            });
            const avgByPeriod = Object.entries(byPeriod).map(([period, levels]) => ({
                period,
                avg: levels.length > 0 ? levels.reduce((a: number, b: number) => a + b, 0) / levels.length : 3
            }));
            const peakWindows = avgByPeriod.filter(p => p.avg >= 4).map(p => p.period);
            const lowWindows = avgByPeriod.filter(p => p.avg <= 2).map(p => p.period);
            // Cache on user
            await User.findByIdAndUpdate(userId, {
                energyProfile: {peakWindows, lowWindows, computedAt: new Date()}
            });
            return {peakWindows, lowWindows};
        }

        // Inferred fallback: derive from FocusSession quality ratings
        const sessions = await FocusSessionModel.find({
            userId,
            qualityRating: {$gte: 1}
        }).sort({startedAt: -1}).limit(50);
        if (sessions.length >= 5) {
            const periodScores: Record<string, number[]> = {morning: [], afternoon: [], evening: [], night: []};
            sessions.forEach((s: any) => {
                const h = new Date(s.startedAt).getHours();
                const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
                periodScores[period].push(s.qualityRating || 3);
            });
            const avgByPeriod = Object.entries(periodScores).map(([period, scores]) => ({
                period,
                avg: scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 3
            }));
            const peakWindows = avgByPeriod.filter(p => p.avg >= 3.5).map(p => p.period);
            const lowWindows = avgByPeriod.filter(p => p.avg <= 2).map(p => p.period);
            await User.findByIdAndUpdate(userId, {
                energyProfile: {peakWindows, lowWindows, computedAt: new Date()}
            });
            return {peakWindows, lowWindows};
        }

        return {peakWindows: ['morning', 'afternoon'], lowWindows: ['night']};
    }

    // Phase 2.4 — Standalone burnout signal computation
    async function computeBurnoutSignal(userId: string): Promise<{ triggers: string[], severity: string } | null> {
        const today = new Date();
        const fourteenDaysAgo = new Date(today);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const dateStr = fourteenDaysAgo.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        // Check 1: 9+ consecutive active days
        const recentPlans = await DailyPlanModel.find({
            userId, date: {$gte: dateStr, $lte: todayStr}
        }).sort({date: 1});
        let consecutiveDays = 0;
        let maxStreak = 0;
        for (let i = 0; i < recentPlans.length; i++) {
            const planDate = new Date(recentPlans[i].date);
            if (i === 0) {
                consecutiveDays = 1;
                maxStreak = 1;
                continue;
            }
            const prevDate = new Date(recentPlans[i - 1].date);
            const diffDays = (planDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays <= 1) consecutiveDays++;
            else consecutiveDays = 1;
            maxStreak = Math.max(maxStreak, consecutiveDays);
        }

        // Check 2: 3+ late-night focus sessions in a week
        const allSessions = await FocusSessionModel.find({
            userId, startedAt: {$gte: fourteenDaysAgo}
        });
        let lateNightCount = 0;
        allSessions.forEach((s: any) => {
            const h = new Date(s.startedAt).getHours();
            if (h >= 22 || h < 5) lateNightCount++;
        });

        // Check 3: weekend work
        const weekendSessions = allSessions.filter((s: any) => {
            const d = new Date(s.startedAt).getDay();
            return d === 0 || d === 6;
        });

        const triggers: string[] = [];
        if (maxStreak >= 9) triggers.push('consecutive_active_days');
        if (lateNightCount >= 3) triggers.push('late_night_focus_sessions');
        if (weekendSessions.length >= 6) triggers.push('excessive_weekend_work');

        if (triggers.length === 0) return null;

        const severity = triggers.length >= 2 ? 'high' : triggers.length === 1 && maxStreak >= 12 ? 'high' : 'medium';
        return {triggers, severity};
    }

    const checkAIUsage = async (req: any, res: any, next: any) => {
        try {
            const user = await User.findById(req.uid).select('isPremium premiumExpiry tier tierExpiry subscriptionPlan');
            if (!user) return res.status(404).json({error: "User not found"});

            const now = new Date();
            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium) {
                const isExpired = user.premiumExpiry && user.premiumExpiry < now;
                if (!isExpired) effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }

            const requiredTier = FEATURE_TIER_REQUIREMENT[req.path];
            if (requiredTier) {
                const order = {free: 0, pro: 1, pro_plus: 2};
                if (order[effectiveTier] < order[requiredTier]) {
                    return res.status(403).json({
                        error: 'upgrade_required',
                        requiredTier,
                        message: `This feature requires ${requiredTier === 'pro_plus' ? 'Pro+' : 'Pro'}`
                    });
                }
            }

            if (effectiveTier === 'pro_plus') {
                const today = now.toISOString().split('T')[0];

                // Increment first, then check — avoids TOCTOU race
                const counter = await AIUsage.findOneAndUpdate(
                    {userId: req.uid, date: today, endpoint: req.path},
                    {$inc: {count: 1}, $setOnInsert: {timestamp: now}},
                    {upsert: true, new: true, rawResult: true}
                );

                const newCount = counter.value?.count || 1;

                if (newCount > DAILY_FAIR_USE_CAP) {
                    // Roll back the increment
                    await AIUsage.findOneAndUpdate(
                        {userId: req.uid, date: today, endpoint: req.path},
                        {$inc: {count: -1}}
                    );
                    return res.status(429).json({
                        error: "Daily AI limit reached",
                        limit: DAILY_FAIR_USE_CAP,
                        used: newCount - 1,
                        message: `You've used all ${DAILY_FAIR_USE_CAP} AI calls today. Try again tomorrow.`
                    });
                }

                res.setHeader('X-AI-Usage-Remaining', String(Math.max(0, DAILY_FAIR_USE_CAP - newCount)));
                res.setHeader('X-AI-Usage-Limit', String(DAILY_FAIR_USE_CAP));
                return next();
            }

            const tierLimits = TIER_LIMITS[effectiveTier];
            const limit = tierLimits?.[req.path];
            if (limit == null) return next();

            const today = now.toISOString().split('T')[0];

            const counter = await AIUsage.findOneAndUpdate(
                {userId: req.uid, date: today, endpoint: req.path},
                {$inc: {count: 1}, $setOnInsert: {timestamp: now}},
                {upsert: true, new: true, rawResult: true}
            );

            const usageCount = counter.value?.count || 1;

            if (usageCount > limit) {
                await AIUsage.findOneAndUpdate(
                    {userId: req.uid, date: today, endpoint: req.path},
                    {$inc: {count: -1}}
                );
                return res.status(403).json({
                    error: effectiveTier === 'free' ? "Daily free-tier limit reached" : "Daily tier limit reached",
                    limit,
                    used: usageCount - 1,
                    endpoint: req.path,
                    tier: effectiveTier,
                    message: `You've used all ${limit} ${effectiveTier} AI calls for this endpoint today.`,
                    upgradeHint: effectiveTier === 'free' ? 'Upgrade to Pro for higher limits.' : 'Upgrade to Pro+ for unlimited.'
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

    const requireTier = (minTier: 'pro' | 'pro_plus') => async (req: any, res: any, next: any) => {
        try {
            const user = await User.findById(req.uid).select('tier tierExpiry isPremium premiumExpiry subscriptionPlan');
            if (!user) return res.status(404).json({error: "User not found"});
            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium) {
                const isExpired = user.premiumExpiry && user.premiumExpiry < new Date();
                if (!isExpired) effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }
            const order = {free: 0, pro: 1, pro_plus: 2};
            if (order[effectiveTier] < order[minTier]) {
                return res.status(403).json({
                    error: 'upgrade_required',
                    requiredTier: minTier,
                    currentTier: effectiveTier,
                    message: `This feature requires ${minTier === 'pro_plus' ? 'Pro+' : 'Pro'}`
                });
            }
            next();
        } catch (err) {
            console.error("requireTier error:", err);
            res.status(500).json({error: "Tier check failed"});
        }
    };

    // --- API Routes ---

    // Connect to MongoDB on server start (non-blocking to prevent server startup timeouts)
    connectDB().catch(err => {
        console.error("Failed to connect to MongoDB on startup:", err);
    });

    const verifyToken = async (req: any, res: any, next: any) => {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) return res.status(401).json({error: 'Unauthorized'});
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            // Reject 2FA temp tokens — they are single-purpose for /2fa/validate-login only
            if (decoded.twoFA) {
                return res.status(401).json({error: 'Incomplete 2FA verification'});
            }
            req.uid = decoded.uid;
            // Invalidate JWTs issued before a password reset
            if (decoded.tv !== undefined) {
                await connectDB();
                const user = await User.findById(decoded.uid).select('tokenVersion');
                if (user && user.tokenVersion !== decoded.tv) {
                    return res.status(401).json({error: 'Token invalidated — please log in again'});
                }
            }
            next();
        } catch {
            res.status(401).json({error: 'Invalid token'});
        }
    };

    // Admin middleware — must be used after verifyToken
    const requireAdmin = async (req: any, res: any, next: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('role');
            if (!user || user.role !== 'admin') {
                return res.status(403).json({error: 'Admin access required'});
            }
            next();
        } catch {
            res.status(403).json({error: 'Admin access required'});
        }
    };

    // Helper: compute local date string (YYYY-MM-DD) from a Date, avoiding the
    // UTC-shift bug that occurs when using new Date().toISOString().split('T')[0].
    function localDateStr(d: Date = new Date()): string {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Award quest completion XP (100 XP + level-up) — deduplicated helper
    async function awardQuestCompletionXP(userId: string) {
        try {
            const questUser = await User.findOne({_id: userId});
            if (!questUser) return;
            const g = questUser.gamification || {
                currentStreak: 0,
                longestStreak: 0,
                lastActiveDate: null,
                xp: 0,
                level: 1,
                totalTasksCompleted: 0,
                onTimeTasksCompleted: 0,
                earnedBadges: []
            };
            g.xp += 100;
            while (g.xp >= g.level * 200) {
                g.level += 1;
            }
            if (!g.earnedBadges) g.earnedBadges = [];
            questUser.gamification = g;
            questUser.markModified('gamification');
            await questUser.save();
        } catch { /* non-critical */
        }
    }

    async function processGamificationOnTaskComplete(userId: string, task: any) {
        try {
            // Read current state to compute streak/badges, then write with $inc/$set
            // instead of $set: { gamification } to avoid clobbering concurrent updates.
            const user = await User.findOne({_id: userId});
            if (!user) return null;

            let gamification = user.gamification || {
                currentStreak: 0,
                longestStreak: 0,
                lastActiveDate: null,
                xp: 0,
                level: 1,
                totalTasksCompleted: 0,
                onTimeTasksCompleted: 0,
                earnedBadges: []
            };

            const today = localDateStr();

            // Compute new streak (with grace days / streak freezes)
            let newStreak = gamification.currentStreak;
            let freezesUsed = gamification.streakFreezesUsedDates || [];
            let freezesAvailable = gamification.streakFreezesAvailable ?? 2;
            let freezeUsedToday = false;
            if (gamification.lastActiveDate !== today) {
                if (gamification.lastActiveDate) {
                    const lastActive = new Date(gamification.lastActiveDate);
                    const todayDate = new Date(today);
                    const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) {
                        newStreak = gamification.currentStreak + 1;
                    } else if (diffDays === 2 && freezesAvailable > 0) {
                        // Only 1 missed day — consume a freeze
                        freezesAvailable -= 1;
                        freezesUsed.push(gamification.lastActiveDate);
                        freezeUsedToday = true;
                        newStreak = gamification.currentStreak + 1;
                    } else {
                        newStreak = 1;
                    }
                } else {
                    newStreak = 1;
                }
            }
            const newLongest = Math.max(gamification.longestStreak, newStreak);

            const isOnTime = !task.deadline || new Date(task.deadline) >= new Date();
            const xpEarned = isOnTime ? 50 : 25;

            // Compute new totals for badge checks
            const newTotal = gamification.totalTasksCompleted + 1;
            const newOnTime = gamification.onTimeTasksCompleted + (isOnTime ? 1 : 0);
            const newXP = gamification.xp + xpEarned;

            // Level-up
            let level = gamification.level;
            let levelUp = null;
            let tmpXP = newXP;
            while (tmpXP >= level * 200) {
                level += 1;
                levelUp = level;
            }

            // Badge checks
            const newBadges: string[] = [];
            const addBadge = (id: string, condition: boolean) => {
                if (condition && !gamification.earnedBadges.includes(id)) {
                    newBadges.push(id);
                }
            };
            addBadge('streak_3', newStreak >= 3);
            addBadge('streak_7', newStreak >= 7);
            addBadge('streak_30', newStreak >= 30);
            addBadge('streak_100', newStreak >= 100);
            addBadge('tasks_50', newTotal >= 50);
            addBadge('tasks_500', newTotal >= 500);
            addBadge('punctual_10', newOnTime >= 10);
            addBadge('deadline_50', newOnTime >= 50);

            // Atomic write with $inc for counters, $set for streak/date/level, $addToSet for badges
            const updateOp: any = {
                $inc: {
                    'gamification.xp': xpEarned,
                    'gamification.totalTasksCompleted': 1,
                    ...(isOnTime ? {'gamification.onTimeTasksCompleted': 1} : {})
                },
                $set: {
                    'gamification.currentStreak': newStreak,
                    'gamification.longestStreak': newLongest,
                    'gamification.lastActiveDate': today,
                    'gamification.level': level,
                    ...(freezeUsedToday ? {
                        'gamification.streakFreezesAvailable': freezesAvailable,
                        'gamification.streakFreezesUsedDates': freezesUsed
                    } : {})
                }
            };
            if (newBadges.length > 0) {
                updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
            }

            const updateResult = await User.findOneAndUpdate(
                {_id: userId, 'gamification.lastActiveDate': gamification.lastActiveDate},
                updateOp,
                {new: true}
            );

            if (!updateResult) {
                console.warn("Gamification update skipped due to concurrent modification");
                return null;
            }

            return {xpEarned, newBadges, levelUp};
        } catch (e) {
            console.error("Gamification error:", e);
            return null;
        }
    }

    // Derive quest progress from its linked tasks. Called from every completion path
    // (session complete, direct task complete, subtask toggle) so quest progress never
    // drifts out of sync with reality.
    async function syncQuestProgress(userId: string, goalId: string) {
        try {
            const tasks = await Task.find({userId, goalId});
            if (tasks.length === 0) return null;
            const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
            const progress = Math.round((completedCount / tasks.length) * 100);
            const isCompleted = progress === 100;
            const goal = await Goal.findOne({_id: goalId, userId});
            if (!goal) return null;
            // Only update if something actually changed
            if (goal.progress === progress && goal.completed === isCompleted) return {progress, completed: isCompleted};
            const updateData: any = {progress};
            if (isCompleted && !goal.completed) {
                updateData.completed = true;
                updateData.completedAt = goal.completedAt || new Date().toISOString();
            } else if (!isCompleted) {
                updateData.completed = false;
                updateData.completedAt = null;
            }
            await Goal.findOneAndUpdate({_id: goalId, userId}, {$set: updateData});
            return {progress, completed: isCompleted};
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
            const goal = await Goal.findOne({_id: task.goalId, userId: task.userId});
            if (goal?.type === 'quest') return 'PACED_SUBTASKS';
        }
        return 'SAME_DAY_SUBTASKS';
    }

    // Award XP for completing a session (smaller than task completion XP).
    async function processGamificationOnSessionComplete(userId: string) {
        try {
            const user = await User.findOne({_id: userId});
            if (!user) return null;
            let gamification = user.gamification || {
                currentStreak: 0,
                longestStreak: 0,
                lastActiveDate: null,
                xp: 0,
                level: 1,
                totalTasksCompleted: 0,
                onTimeTasksCompleted: 0,
                earnedBadges: []
            };
            const today = localDateStr();

            // Compute new streak (with grace days / streak freezes)
            let newStreak = gamification.currentStreak;
            let freezesUsed = gamification.streakFreezesUsedDates || [];
            let freezesAvailable = gamification.streakFreezesAvailable ?? 2;
            let freezeUsedToday = false;
            if (gamification.lastActiveDate !== today) {
                if (gamification.lastActiveDate) {
                    const lastActive = new Date(gamification.lastActiveDate);
                    const todayDate = new Date(today);
                    const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) {
                        newStreak = gamification.currentStreak + 1;
                    } else if (diffDays === 2 && freezesAvailable > 0) {
                        freezesAvailable -= 1;
                        freezesUsed.push(gamification.lastActiveDate);
                        freezeUsedToday = true;
                        newStreak = gamification.currentStreak + 1;
                    } else {
                        newStreak = 1;
                    }
                } else {
                    newStreak = 1;
                }
            }
            const newLongest = Math.max(gamification.longestStreak, newStreak);

            const xpEarned = 10;
            const newXP = gamification.xp + xpEarned;
            let level = gamification.level;
            let levelUp = null;
            let tmpXP = newXP;
            while (tmpXP >= level * 200) {
                level += 1;
                levelUp = level;
            }

            const newBadges: string[] = [];
            const addBadge = (id: string, condition: boolean) => {
                if (condition && !gamification.earnedBadges.includes(id)) {
                    newBadges.push(id);
                }
            };
            addBadge('streak_3', newStreak >= 3);
            addBadge('streak_7', newStreak >= 7);
            addBadge('streak_30', newStreak >= 30);
            addBadge('streak_100', newStreak >= 100);

            const updateOp: any = {
                $inc: {'gamification.xp': xpEarned},
                $set: {
                    'gamification.currentStreak': newStreak,
                    'gamification.longestStreak': newLongest,
                    'gamification.lastActiveDate': today,
                    'gamification.level': level,
                    ...(freezeUsedToday ? {
                        'gamification.streakFreezesAvailable': freezesAvailable,
                        'gamification.streakFreezesUsedDates': freezesUsed
                    } : {})
                }
            };
            if (newBadges.length > 0) {
                updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
            }

            const updateResult = await User.findOneAndUpdate(
                {_id: userId, 'gamification.lastActiveDate': gamification.lastActiveDate},
                updateOp,
                {new: true}
            );
            if (!updateResult) {
                console.warn("Session gamification skipped due to concurrent modification");
                return null;
            }
            return {xpEarned, newBadges, levelUp};
        } catch (e) {
            console.error("Session gamification error:", e);
            return null;
        }
    }

    app.get("/api/health", (req, res) => {
        res.json({status: "ok"});
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
        const obj = typeof doc.toObject === "function" ? doc.toObject() : {...doc};
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
                Task.find({userId}).sort({createdAt: -1}),
                Goal.find({userId}).sort({createdAt: -1}),
                DailyPlanModel.find({userId}),
                ChatMessage.find({userId}).sort({timestamp: 1}),
                AIDecision.find({userId}).sort({timestamp: -1}),
                FocusSessionModel.find({userId}).sort({startedAt: -1}),
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

            res.json({payload, canonicalJson, contentHash});
        } catch (error: any) {
            console.error("Backup export error:", error);
            res.status(500).json({error: "Failed to export backup data"});
        }
    });

    // POST /api/backup/sign — signs an already-serialized backup payload.
    // Body: { canonicalJson: string }
    const backupLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        keyGenerator: (req: any) => req.uid || ipKeyGenerator(req.ip),
        message: {error: "Too many backup requests. Please try again later."}
    });
    app.post("/api/backup/sign", verifyToken, backupLimiter, async (req: any, res: any) => {
        try {
            const {canonicalJson} = req.body;
            if (!canonicalJson || typeof canonicalJson !== "string") {
                return res.status(400).json({error: "canonicalJson (string) is required"});
            }
            if (canonicalJson.length > 10 * 1024 * 1024) {
                return res.status(413).json({error: "Backup payload too large (max 10MB)"});
            }
            const contentHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
            const signature = signBackupPayload(canonicalJson);
            res.json({contentHash, signature});
        } catch (error: any) {
            res.status(500).json({error: "Failed to sign backup"});
        }
    });

    // POST /api/backup/verify — verifies a downloaded backup's signature
    // before it is restored. Body: { canonicalJson: string, signature: string }
    app.post("/api/backup/verify", verifyToken, async (req: any, res: any) => {
        try {
            const {canonicalJson, signature} = req.body;
            if (!canonicalJson || !signature) {
                return res.status(400).json({valid: false, error: "canonicalJson and signature are required"});
            }
            const valid = verifyBackupSignature(canonicalJson, signature);
            res.json({valid});
        } catch (error: any) {
            res.status(500).json({valid: false, error: "Failed to verify backup"});
        }
    });

    // --- MongoDB Authentication Endpoints ---

    app.post(["/register/user", "/api/register/user", "/api/auth/register"], authLimiter, async (req, res) => {
        try {
            const {email, password, name, address} = req.body;
            if (!email || !password || !name) {
                return res.status(400).json({error: "Please provide email, password, and name"});
            }
            if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({error: "Invalid email format"});
            }
            if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
                return res.status(400).json({error: "Password must be 8-128 characters"});
            }
            await connectDB();
            const existingUser = await User.findOne({email: email.toLowerCase()});
            if (existingUser) {
                return res.status(400).json({error: "User already exists with this email"});
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                address: address || "",
                picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`
            });
            const token = jwt.sign({
                uid: newUser._id.toString(),
                email: newUser.email,
                tv: 0
            }, JWT_SECRET, {expiresIn: '30d'});
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
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/login", authLimiter, async (req, res) => {
        try {
            const {email, password} = req.body;
            if (!email || !password) {
                return res.status(400).json({error: "Please provide email and password"});
            }
            await connectDB();
            const user = await User.findOne({email: email.toLowerCase()});
            if (!user || !user.password) {
                // Same generic error whether the account doesn't exist or is a
                // Google-only account with no password set, so we don't leak
                // which case it is.
                return res.status(400).json({error: "Invalid email or password"});
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({error: "Invalid email or password"});
            }

            // ── 2FA: if enabled, return temp token instead of full JWT ──────────
            if (user.twoFactorEnabled) {
                const tempToken = jwt.sign(
                    {uid: user._id.toString(), email: user.email, twoFA: true},
                    JWT_SECRET,
                    {expiresIn: '5m'}
                );
                return res.json({requires2FA: true, tempToken});
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
                // Send warning email (non-blocking, but log errors)
                const {sendLoginWarningEmail} = await import('./src/lib/email.js');
                sendLoginWarningEmail(user.email, user.name, currentIP, currentDevice).catch((err: Error) => {
                    console.error('Login warning email failed:', err);
                });
            }

            const token = jwt.sign({
                uid: user._id.toString(),
                email: user.email,
                tv: user.tokenVersion || 0
            }, JWT_SECRET, {expiresIn: '30d'});
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
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/guest", guestLimiter, async (req, res) => {
        try {
            await connectDB();
            // S3: Cap total guest accounts to prevent DB bloat. Auto-prune guests older than 30 days.
            const GUEST_CAP = 500;
            const guestCount = await User.countDocuments({isGuest: true});
            if (guestCount >= GUEST_CAP) {
                // Prune oldest 10% of guests to make room
                const pruneCount = Math.ceil(GUEST_CAP * 0.1);
                const oldestGuests = await User.find({isGuest: true}).sort({createdAt: 1}).limit(pruneCount).select('_id');
                if (oldestGuests.length > 0) {
                    const ids = oldestGuests.map((g: any) => g._id);
                    await Promise.all([
                        User.deleteMany({_id: {$in: ids}}),
                        Task.deleteMany({userId: {$in: ids}}),
                        Goal.deleteMany({userId: {$in: ids}}),
                        ChatMessage.deleteMany({userId: {$in: ids}}),
                        DailyPlanModel.deleteMany({userId: {$in: ids}}),
                        FocusSessionModel.deleteMany({userId: {$in: ids}}),
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
            const token = jwt.sign({
                uid: guest._id.toString(),
                email: guest.email,
                tv: 0
            }, JWT_SECRET, {expiresIn: '30d'});
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
            res.status(500).json({error: safeError(error)});
        }
    });

    function getCorrectedGamification(gamificationObj: any) {
        if (!gamificationObj) return gamificationObj;

        // Convert to plain object if it's a mongoose document
        const gamification = gamificationObj.toObject ? gamificationObj.toObject() : {...gamificationObj};

        const today = localDateStr();
        if (gamification.lastActiveDate && gamification.lastActiveDate !== today) {
            const lastActive = new Date(gamification.lastActiveDate);
            const todayDate = new Date(today);
            const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 1) {
                // Check if a streak freeze could cover this gap
                const freezesAvailable = gamification.streakFreezesAvailable ?? 2;
                if (freezesAvailable <= 0) {
                    gamification.currentStreak = 0;
                }
                // If freezes are available, assume the streak is still valid
                // (the actual freeze decision happens in processGamificationOnTaskComplete)
            }
        }
        return gamification;
    }

    app.get("/api/auth/me", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            const now = new Date();
            const isExpired = user.premiumExpiry && user.premiumExpiry < now;
            const isActive = user.isPremium && !isExpired;

            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium && !isExpired) {
                effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }

            let aiUsage: Record<string, { used: number; limit: number }> = {};
            if (effectiveTier !== 'pro_plus') {
                const today = now.toISOString().split('T')[0];
                const usageRecords = await AIUsage.aggregate([
                    {$match: {userId: req.uid, date: today}},
                    {$group: {_id: '$endpoint', count: {$sum: '$count'}}}
                ]);
                const tierLimits = TIER_LIMITS[effectiveTier] || TIER_LIMITS.free;
                for (const [endpoint, limit] of Object.entries(tierLimits)) {
                    const record = usageRecords.find((r: any) => r._id === endpoint);
                    aiUsage[endpoint] = {used: record?.count || 0, limit: limit as number};
                }
            }

            res.json({
                uid: user._id.toString(),
                email: user.email,
                name: user.name,
                picture: user.picture,
                address: user.address || "",
                gamification: getCorrectedGamification(user.gamification) || {
                    currentStreak: 0,
                    longestStreak: 0,
                    xp: 0,
                    level: 1,
                    totalTasksCompleted: 0,
                    onTimeTasksCompleted: 0,
                    earnedBadges: [],
                    unlockedPersonalities: ['default'],
                    activePersonality: 'default'
                },
                isPremium: isActive,
                tier: effectiveTier,
                tierExpiry: user.tierExpiry || user.premiumExpiry,
                premiumExpiry: user.premiumExpiry,
                subscriptionPlan: user.subscriptionPlan,
                subscriptionActive: user.subscriptionActive || false,
                role: user.role || 'user',
                aiUsage
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
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
            const {personalityId} = req.body;
            const cost = PERSONALITY_COSTS[personalityId];
            if (cost === undefined) {
                return res.status(400).json({error: "Unknown personality"});
            }

            // Atomic unlock: deduct XP + add personality only if XP sufficient and not already unlocked
            const result = await User.findOneAndUpdate(
                {
                    _id: req.uid,
                    'gamification.xp': {$gte: cost},
                    'gamification.unlockedPersonalities': {$ne: personalityId}
                },
                {
                    $inc: {'gamification.xp': -cost},
                    $addToSet: {'gamification.unlockedPersonalities': personalityId},
                    $set: {'gamification.activePersonality': personalityId}
                },
                {new: true}
            );

            if (!result) {
                // Check why it failed
                const user = await User.findById(req.uid).select('gamification');
                if (!user) return res.status(404).json({error: "User not found"});
                if ((user.gamification?.xp || 0) < cost) return res.status(400).json({error: "Not enough XP"});
                if ((user.gamification?.unlockedPersonalities || []).includes(personalityId)) {
                    return res.status(400).json({error: "Already unlocked"});
                }
                return res.status(500).json({error: "Failed to unlock personality"});
            }

            res.json({gamification: result.gamification});
        } catch (err: any) {
            res.status(500).json({error: safeError(err)});
        }
    });

    app.put("/api/user/personalities/active", verifyToken, async (req: any, res: any) => {
        try {
            const {personalityId} = req.body;
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            if (!user.gamification || !user.gamification.unlockedPersonalities?.includes(personalityId)) {
                return res.status(400).json({error: "Personality not unlocked"});
            }

            user.gamification.activePersonality = personalityId;
            user.markModified('gamification');
            await user.save();

            res.json({gamification: user.gamification});
        } catch (err: any) {
            res.status(500).json({error: safeError(err)});
        }
    });


    app.put("/api/auth/profile", verifyToken, async (req: any, res: any) => {
        try {
            const {name, address} = req.body;
            const cleanName = typeof name === 'string' ? name.trim() : '';
            const cleanAddress = typeof address === 'string' ? address.trim() : '';
            if (!cleanName || cleanName.length > 200) {
                return res.status(400).json({error: "Name is required and must be under 200 characters"});
            }
            if (cleanAddress.length > 1000) {
                return res.status(400).json({error: "Address must be under 1000 characters"});
            }
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            user.name = cleanName;
            user.address = cleanAddress;
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
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/change-password", verifyToken, async (req: any, res: any) => {
        try {
            const {currentPassword, newPassword} = req.body;
            if (!currentPassword || !newPassword) {
                return res.status(400).json({error: "Please provide current password and new password"});
            }
            if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({error: "Password must be 8-128 characters"});
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            if (user.authProvider === 'google') {
                return res.status(400).json({error: "Google accounts do not have a local password to change."});
            }

            if (!user.password) {
                return res.status(400).json({error: "No local password set for this account"});
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({error: "Incorrect current password"});
            }

            user.password = await bcrypt.hash(newPassword, 10);
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.passwordChangedAt = new Date();
            await user.save();

            res.json({message: "Password updated successfully"});
        } catch (error: any) {
            console.error("Change password error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Send Email to Address ───────────────────────────────────────────────────────
    app.post("/api/email/send", verifyToken, emailLimiter, async (req: any, res: any) => {
        try {
            const {to, subject, text, html} = req.body;

            if (!to || !subject || !text) {
                return res.status(400).json({error: "to, subject, and text are required"});
            }
            // Validate email format
            if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
                return res.status(400).json({error: "Invalid email address"});
            }
            // Size limits
            if (subject.length > 200) return res.status(400).json({error: "Subject too long (max 200 chars)"});
            if (text.length > 10000) return res.status(400).json({error: "Email body too long (max 10,000 chars)"});

            const {sendEmail} = await import('./src/lib/email.js');
            const sent = await sendEmail(to, subject, text, html);

            if (!sent) {
                return res.status(500).json({error: "Failed to send email. Check that SMTP credentials are configured correctly."});
            }

            res.json({success: true, message: "Email sent successfully"});
        } catch (error: any) {
            console.error("Send email error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Password Recovery ───────────────────────────────────────────────────────
    app.post("/api/auth/forgot-password", authLimiter, async (req: any, res: any) => {
        try {
            const {email} = req.body;
            if (!email) return res.status(400).json({error: "Email is required"});
            await connectDB();
            const user = await User.findOne({email: email.toLowerCase()});
            // Always return success to prevent user enumeration
            if (!user || user.authProvider === 'google' || !user.password) {
                return res.json({message: "If an account with that email exists, a reset link has been sent."});
            }
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            user.passwordResetTokenHash = tokenHash;
            user.passwordResetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
            await user.save();
            // Send email (non-blocking, but log errors)
            const {sendPasswordResetEmail} = await import('./src/lib/email.js');
            sendPasswordResetEmail(user.email, user.name, rawToken).catch((err: Error) => {
                console.error('Password reset email failed:', err);
            });
            res.json({message: "If an account with that email exists, a reset link has been sent."});
        } catch (error: any) {
            console.error("Forgot password error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/auth/reset-password/:token", authLimiter, async (req: any, res: any) => {
        try {
            const {token} = req.params;
            if (!token) return res.status(400).json({valid: false});
            await connectDB();
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const user = await User.findOne({
                passwordResetTokenHash: tokenHash,
                passwordResetExpiry: {$gt: new Date()}
            });
            if (!user) return res.json({valid: false});
            res.json({valid: true});
        } catch (error: any) {
            res.json({valid: false});
        }
    });

    app.post("/api/auth/reset-password", authLimiter, async (req: any, res: any) => {
        try {
            const {token, newPassword} = req.body;
            if (!token || !newPassword) return res.status(400).json({error: "Token and new password are required"});
            if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({error: "Password must be 8-128 characters"});
            await connectDB();
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const user = await User.findOne({
                passwordResetTokenHash: tokenHash,
                passwordResetExpiry: {$gt: new Date()}
            });
            if (!user) return res.status(400).json({error: "Invalid or expired reset token"});
            user.password = await bcrypt.hash(newPassword, 10);
            user.passwordResetTokenHash = null;
            user.passwordResetExpiry = null;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.passwordChangedAt = new Date();
            await user.save();
            res.json({message: "Password reset successfully"});
        } catch (error: any) {
            console.error("Reset password error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Two-Factor Authentication (TOTP) ───────────────────────────────────────
    app.post("/api/auth/2fa/status", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});
            res.json({enabled: !!user.twoFactorEnabled});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/2fa/setup", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});
            if (user.twoFactorEnabled) return res.status(400).json({error: "2FA is already enabled. Disable it first."});
            const {generateTotpSecret, generateQrDataUrl} = await import('./src/lib/totp.js');
            const {secret, otpauthUrl} = generateTotpSecret(user.email);
            const qrCodeDataUrl = await generateQrDataUrl(otpauthUrl);
            // Store secret temporarily (not enabled yet until verified)
            user.twoFactorSecret = encryptToken(secret);
            await user.save();
            res.json({secret, qrCodeDataUrl});
        } catch (error: any) {
            console.error("2FA setup error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/2fa/verify", authLimiter, verifyToken, async (req: any, res: any) => {
        try {
            const {code} = req.body;
            if (!code || code.length !== 6) return res.status(400).json({error: "Please enter a 6-digit code"});
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});
            if (!user.twoFactorSecret) return res.status(400).json({error: "No 2FA setup in progress. Start setup first."});
            if (user.twoFactorEnabled) return res.status(400).json({error: "2FA is already enabled."});
            const {verifyTotpCode} = await import('./src/lib/totp.js');
            const secret = decryptToken(user.twoFactorSecret);
            if (!verifyTotpCode(secret, code)) return res.status(400).json({error: "Invalid code. Please try again."});
            user.twoFactorEnabled = true;
            await user.save();
            res.json({message: "Two-factor authentication enabled successfully"});
        } catch (error: any) {
            console.error("2FA verify error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/2fa/disable", authLimiter, verifyToken, async (req: any, res: any) => {
        try {
            const {code} = req.body;
            if (!code || code.length !== 6) return res.status(400).json({error: "Please enter a 6-digit code"});
            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});
            if (!user.twoFactorEnabled) return res.status(400).json({error: "2FA is not enabled."});
            const {verifyTotpCode} = await import('./src/lib/totp.js');
            const secret = decryptToken(user.twoFactorSecret);
            if (!verifyTotpCode(secret, code)) return res.status(400).json({error: "Invalid code."});
            user.twoFactorEnabled = false;
            user.twoFactorSecret = null;
            await user.save();
            res.json({message: "Two-factor authentication disabled"});
        } catch (error: any) {
            console.error("2FA disable error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/auth/2fa/validate-login", authLimiter, async (req: any, res: any) => {
        try {
            const {tempToken, code} = req.body;
            if (!tempToken || !code) return res.status(400).json({error: "Temp token and code are required"});
            let payload: any;
            try {
                payload = jwt.verify(tempToken, JWT_SECRET) as any;
            } catch {
                return res.status(400).json({error: "Invalid or expired session. Please log in again."});
            }
            if (!payload.twoFA || !payload.uid) return res.status(400).json({error: "Invalid temp token"});
            await connectDB();
            const user = await User.findById(payload.uid);
            if (!user) return res.status(404).json({error: "User not found"});
            if (!user.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({error: "2FA is not enabled"});
            const {verifyTotpCode} = await import('./src/lib/totp.js');
            const secret = decryptToken(user.twoFactorSecret);
            if (!verifyTotpCode(secret, code)) return res.status(400).json({error: "Invalid code"});
            // Bump tokenVersion to invalidate the temp token and any other old sessions
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();
            // Issue full JWT with new version
            const token = jwt.sign({
                uid: user._id.toString(),
                email: user.email,
                tv: user.tokenVersion
            }, JWT_SECRET, {expiresIn: '30d'});
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
            res.status(500).json({error: safeError(error)});
        }
    });

    // --- MongoDB Data Endpoints ---

    app.get("/api/plans/:date", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const plan = await DailyPlanModel.findOne({userId: req.uid, date: req.params.date});
            if (!plan) return res.status(404).json({error: "No plan found for this date"});
            const obj = plan.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/plans/:date", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            let {sessions} = req.body;
            if (sessions && Array.isArray(sessions)) {
                sessions = normalizeSessions(sessions);
            }

            // Enforce completion rules
            if (sessions && Array.isArray(sessions)) {
                const existingPlan = await DailyPlanModel.findOne({userId: req.uid, date: req.params.date});
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
                        const isPast = now > end;
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
                {userId: req.uid, date: req.params.date},
                {$set: {sessions, updatedAt: new Date()}},
                {upsert: true, new: true}
            );
            const obj = plan.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // --- Quest Trail Endpoint ---
    // Returns completed sessions across all dates that reference tasks belonging to a
    // given quest. This powers the "Quest Trail" timeline — a chronological breadcrumb
    // of which subtasks got done on which days.
    app.get("/api/plans/trail/:goalId", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {goalId} = req.params;

            // Find all tasks linked to this quest
            const tasks = await Task.find({userId: req.uid, goalId});
            const taskIds = new Set(tasks.map((t: any) => t._id.toString()));
            const taskTitleMap = new Map(tasks.map((t: any) => [t._id.toString(), t.title]));

            // Find all daily plans that have completed sessions referencing these tasks
            const plans = await DailyPlanModel.find({userId: req.uid});
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
            res.status(500).json({error: safeError(error)});
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
            const {sessionIndex} = req.body;
            if (sessionIndex === undefined || sessionIndex === null) {
                return res.status(400).json({error: "sessionIndex is required"});
            }

            const plan = await DailyPlanModel.findOne({userId: req.uid, date: req.params.date});
            if (!plan) return res.status(404).json({error: "No plan found for this date"});
            if (!Number.isInteger(sessionIndex) || sessionIndex < 0 || sessionIndex >= plan.sessions.length) {
                return res.status(400).json({error: "Invalid session index"});
            }

            const session = plan.sessions[sessionIndex];
            const now = new Date().getTime();
            const end = new Date(session.endTime).getTime();
            const isPast = now > end;

            // Enforce completion rules: must be started or past end time
            if (!isPast && !session.started) {
                return res.status(400).json({error: "Session cannot be completed yet — must be started or past its end time"});
            }

            // Guard against double-completing the same session — atomic check
            if (session.completed) {
                return res.status(400).json({error: "Session already completed"});
            }

            // Atomically mark session as completed — only if not already completed
            const atomicUpdate = await DailyPlanModel.findOneAndUpdate(
                {userId: req.uid, date: req.params.date, [`sessions.${sessionIndex}.completed`]: false},
                {$set: {[`sessions.${sessionIndex}.completed`]: true, [`sessions.${sessionIndex}.started`]: true}},
                {new: true}
            );
            if (!atomicUpdate) {
                // Another request already completed this session
                return res.status(400).json({error: "Session already completed"});
            }
            // Use the atomically-updated session for downstream logic
            const updatedSession = atomicUpdate.sessions[sessionIndex];

            let taskUpdate = null;
            let gamificationUpdates = null;
            let questSync = null;
            let sessionGamification = null;

            // If this session references a real task, update its state
            // Skip for routine/non-task sessions (temp-task-id or invalid ObjectIds)
            const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(session.taskId || '');
            if (session.taskId && isValidObjectId) {
                const task = await Task.findOne({_id: session.taskId, userId: req.uid});
                if (task) {
                    const schedulingMode = session.schedulingMode || await getSchedulingMode(task);
                    const coveredIds = new Set(session.subtaskIds || []);
                    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

                    if (hasSubtasks && coveredIds.size > 0 && schedulingMode !== 'WHOLE_TASK') {
                        // Subtask-level completion: mark only the covered subtasks
                        const updatedSubtasks = task.subtasks.map((st: any) =>
                            coveredIds.has(st.id) ? {...st, completed: true} : st
                        );
                        const allSubtasksDone = updatedSubtasks.every((st: any) => st.completed);
                        const newStatus = allSubtasksDone ? 'completed' : 'in_progress';
                        const shouldAwardTaskGamification = allSubtasksDone && !task.hasBeenCompleted;

                        await Task.findOneAndUpdate(
                            {_id: task._id},
                            {
                                $set: {
                                    subtasks: updatedSubtasks,
                                    status: newStatus, ...(shouldAwardTaskGamification ? {
                                        hasBeenCompleted: true,
                                        completedAt: task.completedAt || new Date().toISOString()
                                    } : {})
                                }
                            }
                        );

                        taskUpdate = {id: task._id.toString(), status: newStatus, subtasks: updatedSubtasks};

                        // Award task-level gamification when task fully completes
                        if (shouldAwardTaskGamification) {
                            gamificationUpdates = await processGamificationOnTaskComplete(req.uid, task);
                        }

                        // Sync quest progress if task belongs to a quest
                        if (task.goalId) {
                            questSync = await syncQuestProgress(req.uid, task.goalId);
                            // Award quest completion XP if quest just completed
                            if (questSync?.completed) {
                                await awardQuestCompletionXP(req.uid);
                            }
                        }
                    } else if (schedulingMode === 'WHOLE_TASK' || !hasSubtasks) {
                        // Whole-task completion
                        const shouldAwardGamification = !task.hasBeenCompleted;
                        await Task.findOneAndUpdate(
                            {_id: task._id},
                            {
                                $set: {
                                    status: 'completed',
                                    hasBeenCompleted: true,
                                    completedAt: task.completedAt || new Date().toISOString()
                                }
                            }
                        );
                        taskUpdate = {id: task._id.toString(), status: 'completed'};
                        if (shouldAwardGamification) {
                            gamificationUpdates = await processGamificationOnTaskComplete(req.uid, task);
                        }
                        if (task.goalId) {
                            questSync = await syncQuestProgress(req.uid, task.goalId);
                            if (questSync?.completed) {
                                await awardQuestCompletionXP(req.uid);
                            }
                        }
                    }
                }
            }

            // Session-level gamification (small XP for completing any session)
            sessionGamification = await processGamificationOnSessionComplete(req.uid);

            const sessionObj = updatedSession.toObject ? updatedSession.toObject() : {...updatedSession};
            res.json({
                session: sessionObj,
                taskUpdate,
                gamificationUpdates,
                questSync,
                sessionGamification
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/tasks", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const tasks = await Task.find({userId: req.uid}).sort({createdAt: -1});
            const formattedTasks = tasks.map((t: any) => {
                const obj = t.toObject();
                obj.id = obj._id.toString();
                delete obj._id;
                delete obj.__v;
                return obj;
            });
            res.json(formattedTasks);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/tasks", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {
                title,
                description,
                priority,
                status,
                deadline,
                estimatedHours,
                goalId,
                subtasks,
                schedulingPreference
            } = req.body;
            const taskData: any = {userId: req.uid};
            if (title != null) taskData.title = String(title).slice(0, 500);
            if (description != null) taskData.description = String(description).slice(0, 5000);
            if (priority != null) taskData.priority = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
            if (status != null) taskData.status = ['todo', 'pending', 'in_progress', 'completed', 'blocked'].includes(status) ? status : 'todo';
            if (deadline != null) taskData.deadline = String(deadline);
            if (estimatedHours != null) taskData.estimatedHours = Math.min(Math.max(Number(estimatedHours) || 0, 0), 1000);
            if (goalId != null) taskData.goalId = String(goalId);
            if (subtasks != null && Array.isArray(subtasks)) taskData.subtasks = subtasks.slice(0, 50);
            if (schedulingPreference != null) taskData.schedulingPreference = String(schedulingPreference);
            const newTask = await Task.create(taskData);
            const obj = newTask.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.put("/api/tasks/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const existingTask = await Task.findOne({_id: req.params.id, userId: req.uid});
            if (!existingTask) return res.status(404).json({error: "Task not found"});

            const isNowCompleted = req.body.status === 'completed';
            const shouldAwardGamification = isNowCompleted && !existingTask.hasBeenCompleted;

            const updateData: any = {};
            const {
                title,
                description,
                priority,
                status,
                deadline,
                estimatedHours,
                goalId,
                subtasks,
                schedulingPreference,
                hasBeenCompleted
            } = req.body;
            if (title != null) updateData.title = String(title).slice(0, 500);
            if (description != null) updateData.description = String(description).slice(0, 5000);
            if (priority != null) updateData.priority = ['high', 'medium', 'low'].includes(priority) ? priority : undefined;
            if (status != null) updateData.status = ['todo', 'pending', 'in_progress', 'completed', 'blocked'].includes(status) ? status : undefined;
            if (deadline != null) updateData.deadline = String(deadline);
            if (estimatedHours != null) updateData.estimatedHours = Math.min(Math.max(Number(estimatedHours) || 0, 0), 1000);
            if (goalId !== undefined) updateData.goalId = goalId ? String(goalId) : null;
            if (subtasks != null && Array.isArray(subtasks)) updateData.subtasks = subtasks.slice(0, 50);
            if (schedulingPreference != null) updateData.schedulingPreference = String(schedulingPreference);
            if (hasBeenCompleted != null) updateData.hasBeenCompleted = Boolean(hasBeenCompleted);

            if (shouldAwardGamification) {
                updateData.hasBeenCompleted = true;
            }
            if (isNowCompleted) {
                updateData.completedAt = existingTask.completedAt || new Date().toISOString();
            } else if (req.body.status && req.body.status !== 'completed') {
                updateData.completedAt = null;
                updateData.hasBeenCompleted = false;
                if (existingTask.subtasks && existingTask.subtasks.length > 0) {
                    updateData.subtasks = existingTask.subtasks.map((st: any) => ({...st, completed: false}));
                }
            }

            const updatedTask = await Task.findOneAndUpdate(
                {_id: req.params.id, userId: req.uid},
                {$set: updateData},
                {new: true}
            );
            if (!updatedTask) return res.status(404).json({error: "Task not found"});
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
                    await awardQuestCompletionXP(req.uid);
                }
            }

            res.json({...obj, gamificationUpdates, questSync});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.delete("/api/tasks/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const deleted = await Task.findOneAndDelete({_id: req.params.id, userId: req.uid});
            if (!deleted) return res.status(404).json({error: "Task not found"});
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    function getCorrectedGoal(goalObj: any) {
        if (!goalObj) return goalObj;
        const goal = goalObj.toObject ? goalObj.toObject() : {...goalObj};
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
            const goals = await Goal.find({userId: req.uid}).sort({createdAt: -1});
            const formattedGoals = goals.map((g: any) => {
                const obj = getCorrectedGoal(g);
                obj.id = obj._id.toString();
                delete obj._id;
                delete obj.__v;
                return obj;
            });
            res.json(formattedGoals);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/goals", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {title, description, type, targetDate, targetValue, unit, subtasks} = req.body;
            const goalData: any = {userId: req.uid};
            if (title != null) goalData.title = String(title).slice(0, 500);
            if (description != null) goalData.description = String(description).slice(0, 5000);
            if (type != null) goalData.type = ['habit', 'quest'].includes(type) ? type : 'habit';
            if (targetDate != null) goalData.targetDate = String(targetDate);
            if (targetValue != null) goalData.targetValue = Number(targetValue);
            if (unit != null) goalData.unit = String(unit).slice(0, 50);
            if (subtasks != null && Array.isArray(subtasks)) goalData.subtasks = subtasks.slice(0, 50);
            const newGoal = await Goal.create(goalData);
            const obj = getCorrectedGoal(newGoal);
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.put("/api/goals/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const existingGoal = await Goal.findOne({_id: req.params.id, userId: req.uid});
            if (!existingGoal) return res.status(404).json({error: "Goal not found"});

            const updateData: any = {};
            const {title, description, type, targetDate, targetValue, unit, subtasks, completed} = req.body;
            if (title != null) updateData.title = String(title).slice(0, 500);
            if (description != null) updateData.description = String(description).slice(0, 5000);
            if (type != null) updateData.type = ['habit', 'quest'].includes(type) ? type : undefined;
            if (targetDate != null) updateData.targetDate = String(targetDate);
            if (targetValue != null) updateData.targetValue = Number(targetValue);
            if (unit != null) updateData.unit = String(unit).slice(0, 50);
            if (subtasks != null && Array.isArray(subtasks)) updateData.subtasks = subtasks.slice(0, 50);
            if (completed === true) {
                updateData.completedAt = existingGoal.completedAt || new Date().toISOString();
            } else if (completed === false) {
                updateData.completedAt = null;
            }

            const updatedGoal = await Goal.findOneAndUpdate(
                {_id: req.params.id, userId: req.uid},
                {$set: updateData},
                {new: true}
            );
            if (!updatedGoal) return res.status(404).json({error: "Goal not found"});
            const obj = getCorrectedGoal(updatedGoal);
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.delete("/api/goals/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const deleted = await Goal.findOneAndDelete({_id: req.params.id, userId: req.uid});
            if (!deleted) return res.status(404).json({error: "Goal not found"});
            // Delete all linked tasks as well
            await Task.deleteMany({goalId: req.params.id, userId: req.uid});
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/chats", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {chatId} = req.query;
            const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 200, 1), 500);
            const skip = Math.max(parseInt(req.query.skip as string) || 0, 0);
            const query: any = {userId: req.uid};
            if (chatId) {
                if (chatId === 'default') {
                    query.$or = [
                        {chatId: 'default'},
                        {chatId: {$exists: false}},
                        {chatId: null}
                    ];
                } else {
                    query.chatId = chatId;
                }
            }
            const chats = await ChatMessage.find(query).sort({timestamp: 1}).skip(skip).limit(limit);
            const formatted = chats.map((c: any) => {
                const obj = c.toObject();
                obj.id = obj._id.toString();
                delete obj._id;
                delete obj.__v;
                return obj;
            });
            res.json(formatted);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/chats/sessions", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const chats = await ChatMessage.find({userId: req.uid}).sort({timestamp: 1});
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
            res.status(500).json({error: safeError(error)});
        }
    });

    app.delete("/api/chats/sessions/:chatId", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {chatId} = req.params;
            const query: any = {userId: req.uid};
            if (chatId === 'default') {
                query.$or = [
                    {chatId: 'default'},
                    {chatId: {$exists: false}},
                    {chatId: null}
                ];
            } else {
                query.chatId = chatId;
            }
            await ChatMessage.deleteMany(query);
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.put("/api/chats/sessions/:chatId", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {chatId} = req.params;
            const {title} = req.body;
            if (!title || typeof title !== 'string') {
                return res.status(400).json({error: "Title is required"});
            }
            const query: any = {userId: req.uid};
            if (chatId === 'default') {
                query.$or = [
                    {chatId: 'default'},
                    {chatId: {$exists: false}},
                    {chatId: null}
                ];
            } else {
                query.chatId = chatId;
            }
            await ChatMessage.updateMany(query, {chatTitle: title});
            res.json({success: true, title});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/chats", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {role, content, chatId, chatTitle} = req.body;
            if (!['user', 'assistant'].includes(role)) {
                return res.status(400).json({error: "role must be 'user' or 'assistant'"});
            }
            if (!content || typeof content !== 'string' || content.length > 50000) {
                return res.status(400).json({error: "content is required and must be under 50,000 characters"});
            }
            const newChat = await ChatMessage.create({
                userId: req.uid,
                role,
                content: content.slice(0, 50000),
                chatId: (typeof chatId === 'string' ? chatId : 'default').slice(0, 100),
                chatTitle: (typeof chatTitle === 'string' ? chatTitle : 'New Chat').slice(0, 200),
                timestamp: new Date()
            });
            const obj = newChat.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/ai-decisions", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const decisions = await AIDecision.find({userId: req.uid}).sort({timestamp: -1});
            const formatted = decisions.map((d: any) => {
                const obj = d.toObject();
                obj.id = obj._id.toString();
                delete obj._id;
                delete obj.__v;
                return obj;
            });
            res.json(formatted);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/ai-decisions", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {title, reason} = req.body;
            const cleanTitle = typeof title === 'string' ? title.trim() : '';
            const cleanReason = typeof reason === 'string' ? reason.trim() : '';
            if (!cleanTitle || cleanTitle.length > 200) {
                return res.status(400).json({error: "Title is required and must be under 200 characters"});
            }
            if (cleanReason.length > 2000) {
                return res.status(400).json({error: "Reason must be under 2000 characters"});
            }
            const newDecision = await AIDecision.create({
                userId: req.uid,
                title: cleanTitle,
                reason: cleanReason,
                timestamp: new Date()
            });
            const obj = newDecision.toObject();
            obj.id = obj._id.toString();
            delete obj._id;
            delete obj.__v;
            res.json(obj);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
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
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const calendar = google.calendar({version: 'v3', auth: oauth2Client});

            const {timeMin, timeMax} = req.query;
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
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/calendar/events", verifyToken, async (req: any, res: any) => {
        try {
            const accessToken = req.headers["x-workspace-token"];
            if (!accessToken) return res.status(401).send("No access token");

            const {summary, description, start, end, location, reminders} = req.body || {};
            if (!summary || typeof summary !== 'string') {
                return res.status(400).json({error: "Event summary is required"});
            }
            const safeBody: any = {summary: summary.substring(0, 500)};
            if (description && typeof description === 'string') safeBody.description = description.substring(0, 5000);
            if (location && typeof location === 'string') safeBody.location = location.substring(0, 500);
            if (start) safeBody.start = start;
            if (end) safeBody.end = end;
            if (reminders) safeBody.reminders = reminders;

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const calendar = google.calendar({version: 'v3', auth: oauth2Client});

            const response = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: safeBody,
            });

            res.json(response.data);
        } catch (error: any) {
            console.error('Error creating event:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/docs", verifyToken, async (req: any, res: any) => {
        try {
            const accessToken = req.headers["x-workspace-token"];
            if (!accessToken) return res.status(401).send("No access token");

            const {title, content} = req.body;
            const cleanTitle = typeof title === 'string' ? title.trim().substring(0, 500) : 'Untitled Document';
            const cleanContent = typeof content === 'string' ? content.substring(0, 500000) : '';

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const docs = google.docs({version: 'v1', auth: oauth2Client});

            // 1. Create empty doc
            const doc = await docs.documents.create({
                requestBody: {title: cleanTitle},
            });

            // 2. Insert content
            if (doc.data.documentId) {
                await docs.documents.batchUpdate({
                    documentId: doc.data.documentId,
                    requestBody: {
                        requests: [
                            {
                                insertText: {
                                    location: {index: 1},
                                    text: cleanContent
                                }
                            }
                        ]
                    }
                });
            }

            res.json(doc.data);
        } catch (error: any) {
            console.error('Error creating Google Doc:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/docs/generate-report", verifyToken, checkAIUsage, async (req: any, res: any) => {
        try {
            const accessToken = req.headers["x-workspace-token"];
            if (!accessToken) return res.status(401).send("No access token");

            const {title, tasks, completedTasks, goals} = req.body;

            let segments: any[] = [];
            try {
                const prompt = `You are a professional assistant generating a comprehensive daily progress report for a user.
        Data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t: any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t: any) => t.title))}
        - Goals and Habits: ${JSON.stringify((goals || []).map((g: any) => ({title: g.title, type: g.type})))}
        
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
                segments = [{text: `Daily Progress Report\nTasks Completed: ${completedTasks?.length || 0}\nRemaining Tasks: ${tasks?.length || 0}\n`}];
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const docs = google.docs({version: 'v1', auth: oauth2Client});

            const doc = await docs.documents.create({
                requestBody: {title},
            });

            if (doc.data.documentId && segments.length > 0) {
                const fullText = segments.map(s => s.text).join("");
                const requests: any[] = [
                    {
                        insertText: {
                            location: {index: 1},
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
                        if (segment.bold) {
                            textStyle.bold = true;
                            fields.push("bold");
                        }
                        if (segment.italic) {
                            textStyle.italic = true;
                            fields.push("italic");
                        }
                        if (segment.underline) {
                            textStyle.underline = true;
                            fields.push("underline");
                        }

                        requests.push({
                            updateTextStyle: {
                                range: {startIndex, endIndex},
                                textStyle,
                                fields: fields.join(",")
                            }
                        });
                    }

                    if (segment.heading && segment.heading !== "NORMAL_TEXT") {
                        requests.push({
                            updateParagraphStyle: {
                                range: {startIndex, endIndex},
                                paragraphStyle: {namedStyleType: segment.heading},
                                fields: "namedStyleType"
                            }
                        });
                    }

                    currentIndex += segmentLength;
                }

                await docs.documents.batchUpdate({
                    documentId: doc.data.documentId,
                    requestBody: {requests}
                });
            }

            res.json(doc.data);
        } catch (error: any) {
            console.error('Error creating Google Doc report:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/presentations/generate", verifyToken, checkAIUsage, async (req: any, res: any) => {
        try {
            const accessToken = req.headers["x-workspace-token"];
            if (!accessToken) return res.status(401).send("No access token");

            const {type, tasks, completedTasks, goals} = req.body;

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const slides = google.slides({version: 'v1', auth: oauth2Client});

            let title = "Generated Presentation";
            if (type === 'project-dashboard') title = `Project Status - ${new Date().toLocaleDateString()}`;
            if (type === 'standup') title = `Daily Standup - ${new Date().toLocaleDateString()}`;
            if (type === 'sprint-planning') title = `Sprint Planning - ${new Date().toLocaleDateString()}`;
            if (type === 'progress-report') title = `Progress Report - ${new Date().toLocaleDateString()}`;

            const response = await slides.presentations.create({
                requestBody: {title},
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
                    slideLayoutReference: {predefinedLayout: 'BLANK'}
                }
            });

            const titleBoxId = `textbox_title_${Date.now()}`;
            requests.push({
                createShape: {
                    objectId: titleBoxId,
                    shapeType: 'TEXT_BOX',
                    elementProperties: {
                        pageObjectId: slide2Id,
                        size: {height: {magnitude: 60, unit: 'PT'}, width: {magnitude: 600, unit: 'PT'}},
                        transform: {scaleX: 1, scaleY: 1, translateX: 50, translateY: 30, unit: 'PT'}
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
                        size: {height: {magnitude: 300, unit: 'PT'}, width: {magnitude: 600, unit: 'PT'}},
                        transform: {scaleX: 1, scaleY: 1, translateX: 50, translateY: 100, unit: 'PT'}
                    }
                }
            });

            let textContent = "";
            try {
                const prompt = `You are a professional assistant generating a 3-5 bullet point slide summary for a "${title}" presentation.
        Use this data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t: any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t: any) => t.title))}
        - Goals/Habits: ${JSON.stringify((goals || []).map((g: any) => g.title))}
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
                    requestBody: {requests}
                });
            }

            res.json(response.data);
        } catch (error: any) {
            console.error('Error creating presentation:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/sheets", verifyToken, async (req: any, res: any) => {
        try {
            const accessToken = req.headers["x-workspace-token"];
            if (!accessToken) return res.status(401).send("No access token");

            const {title, data} = req.body;
            const cleanTitle = typeof title === 'string' ? title.trim().substring(0, 500) : 'Untitled Spreadsheet';
            const cleanData = Array.isArray(data) ? data.slice(0, 1000).map((row: any) =>
                Array.isArray(row) ? row.slice(0, 100).map((cell: any) => String(cell).substring(0, 1000)) : []
            ) : [];

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
            const sheets = google.sheets({version: 'v4', auth: oauth2Client});

            // 1. Create spreadsheet
            const spreadsheet = await sheets.spreadsheets.create({
                requestBody: {properties: {title: cleanTitle}}
            });

            // 2. Append data
            if (spreadsheet.data.spreadsheetId) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: spreadsheet.data.spreadsheetId,
                    range: 'Sheet1!A1',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {values: cleanData}
                });
            }

            res.json(spreadsheet.data);
        } catch (error: any) {
            console.error('Error creating Google Sheet:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // --- Custom Google OAuth Routes (Using google-auth-library) ---

    // Endpoint to expose Google Client ID to frontend for GIS SDK
    // NOTE: A more comprehensive /api/config is defined later in the premium section

    // Handle GIS popup code exchange
    app.post("/api/auth/google/callback", authLimiter, async (req, res) => {
        const {code} = req.body;
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
            const {tokens} = await oauth2Client.getToken(code);
            const accessToken = tokens.access_token;
            oauth2Client.setCredentials(tokens);

            const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: {Authorization: `Bearer ${accessToken}`},
            });

            if (!userRes.ok) return res.status(500).send("Failed to fetch user profile from Google");

            const userInfo = await userRes.json();
            const {sub: googleUid, email, name: rawName, picture} = userInfo;
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
                    {googleId: googleUid},
                    {googleEmail: email.toLowerCase()},
                    {email: email.toLowerCase(), authProvider: 'google'}
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
                    user = await User.findOne({email: email.toLowerCase()});
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

            const taskpilotToken = jwt.sign({
                uid: user._id.toString(),
                email: user.email,
                tv: user.tokenVersion || 0
            }, JWT_SECRET, {expiresIn: '30d'});

            // Calculate effective tier (same logic as /api/auth/me)
            const now = new Date();
            const isExpired = user.premiumExpiry && user.premiumExpiry < now;
            const isActive = user.isPremium && !isExpired;

            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium && !isExpired) {
                effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }

            let aiUsage: Record<string, { used: number; limit: number }> = {};
            if (effectiveTier !== 'pro_plus') {
                const today = now.toISOString().split('T')[0];
                const usageRecords = await AIUsage.aggregate([
                    {$match: {userId: user._id.toString(), date: today}},
                    {$group: {_id: '$endpoint', count: {$sum: '$count'}}}
                ]);
                const tierLimits = TIER_LIMITS[effectiveTier] || TIER_LIMITS.free;
                for (const [endpoint, limit] of Object.entries(tierLimits)) {
                    const record = usageRecords.find((r: any) => r._id === endpoint);
                    aiUsage[endpoint] = {used: record?.count || 0, limit: limit as number};
                }
            }

            res.json({
                accessToken,
                taskpilotToken,
                user: {
                    email: user.email,
                    name: user.name,
                    picture: user.picture,
                    uid: user._id.toString(),
                    address: user.address || "",
                    gamification: getCorrectedGamification(user.gamification) || {
                        currentStreak: 0,
                        longestStreak: 0,
                        xp: 0,
                        level: 1,
                        totalTasksCompleted: 0,
                        onTimeTasksCompleted: 0,
                        earnedBadges: [],
                        unlockedPersonalities: ['default'],
                        activePersonality: 'default'
                    },
                    isPremium: isActive,
                    tier: effectiveTier,
                    tierExpiry: user.tierExpiry || user.premiumExpiry,
                    premiumExpiry: user.premiumExpiry,
                    subscriptionPlan: user.subscriptionPlan,
                    subscriptionActive: user.subscriptionActive || false,
                    role: user.role || 'user',
                    aiUsage
                }
            });
        } catch (err: any) {
            console.error("Google OAuth error:", err);
            res.status(500).send(`Authentication error: ${safeError(err)}`);
        }
    });

    // This server is reachable on more than one domain (e.g. a test URL and a
    // prod URL) at the same time, so we can't hardcode a single APP_URL for
    // building the OAuth redirect_uri. Instead we derive the origin from the
    // incoming request and check it against an explicit allowlist — never
    // trust the Host header blindly, since redirect_uri ends up in a Google
    // API call and an unvalidated host would be an open-redirect risk.
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
        .split(",")
        .map(o => o.trim().replace(/\/$/, ""))
        .filter(Boolean);

    const getRequestOrigin = (req: any) => {
        const host = req.headers['x-forwarded-host'] || req.get('host');
        if (!host) return `${req.protocol}://${req.hostname}`;
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
            return res.status(500).json({error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured in .env"});
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
            } catch {
            }
        }

        const state = jwt.sign({purpose: "oauth_state", origin, currentUserId}, JWT_SECRET, {expiresIn: "10m"});

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: scopes,
            include_granted_scopes: true,
            prompt: "consent",
            state,
        });

        res.json({url: authUrl});
    });

    app.get(["/oauth2callback", "/oauth2callback/"], authLimiter, async (req, res) => {
        const {code, state, error: oauthError} = req.query;

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
            const {tokens} = await oauth2Client.getToken(code as string);
            const accessToken = tokens.access_token;

            oauth2Client.setCredentials(tokens);

            // 2. Fetch User Profile
            const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: {Authorization: `Bearer ${accessToken}`},
            });

            if (!userRes.ok) {
                return res.status(500).send("Failed to fetch user profile from Google");
            }

            const userInfo = await userRes.json();
            const {sub: googleUid, email, name: rawName, picture} = userInfo;
            const name = sanitizeHtml(rawName); // S1: strip HTML tags to prevent stored XSS
            if (!email) {
                return res.status(400).send("Google account has no email address to sign in with.");
            }

            await connectDB();

            // Check if this Google account is already linked to another user
            const existingLinkedUser = await User.findOne({
                $or: [
                    {googleId: googleUid},
                    {googleEmail: email.toLowerCase()},
                    {email: email.toLowerCase(), authProvider: 'google'}
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
                    user = await User.findOne({email: email.toLowerCase()});
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

            const taskpilotToken = jwt.sign({
                uid: user._id.toString(),
                email: user.email,
                tv: user.tokenVersion || 0
            }, JWT_SECRET, {expiresIn: '30d'});

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
                user: ${safeJsonForScript({
                email: user.email,
                name: user.name,
                picture: user.picture,
                uid: user._id.toString(),
                gamification: getCorrectedGamification(user.gamification),
                isPremium: user.isPremium || false,
                premiumExpiry: user.premiumExpiry || null,
                subscriptionPlan: user.subscriptionPlan || null,
                role: user.role || 'user'
            })}
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
            res.status(500).send(`Authentication error: ${safeError(err)}`);
        }
    });

    // --- AI Planning Routes ---

    app.post("/api/generate-quest-steps", verifyToken, checkAIUsage, async (req: any, res: any) => {
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
                model: selectedModel,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    tools: [{googleSearch: {}}]
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

            res.json({tasks: fallbackTasks});
        }
    });

    app.post("/api/analyze-task", verifyToken, checkAIUsage, async (req: any, res: any) => {
        const {title = '', description = '', deadline = '', model = ''} = req.body || {};
        try {
            const selectedModel = getValidModel(model);
            if (title.length + description.length > MAX_INPUT.analyze) {
                return res.status(413).json({error: "Title and description are too long."});
            }

            // Phase 3.1 — fetch velocity profile for personalized estimation
            const velocityProfile = await getUserVelocityProfile(req.uid);
            const profileContext = velocityProfile.size > 0
                ? `\nHistorical velocity data (actual/estimated ratio per category): ${JSON.stringify(Object.fromEntries(velocityProfile))}\nAdjust estimatedHours using the ratio for this task's category if available (e.g., ratio 1.3 means the user typically takes 30% longer than estimated).`
                : '';

            const prompt = `
        You are an intelligent productivity assistant. Analyze the following task.
        Task: ${title}
        Description: ${description || 'N/A'}
        Deadline: ${deadline || 'N/A'}
        Current Time: ${new Date().toISOString()}
        ${profileContext}

        Return a JSON response with the following format, with no markdown formatting around it:
        {
          "estimatedHours": <number>,
          "priority": "<high|medium|low>",
          "subtasks": ["subtask 1", "subtask 2", ...],
          "riskScore": <number 0-100, where 100 is highest risk of missing deadline>,
          "riskReason": "<short 1-2 sentence explanation of why this risk score was assigned>",
          "confidenceScore": <number 0-100, where 100 is highest confidence in this analysis>
        }
        Be realistic with estimated hours. Break down complex tasks into manageable subtasks.
        Risk Score should be high if the deadline is very close and estimated hours is high.
        riskReason must always be provided, even if the risk is low.
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
                riskReason: deadline ? 'Deadline is set but task scope is uncertain with limited information.' : 'No deadline specified, risk is low.',
                confidenceScore: 85
            };

            res.json(fallbackResult);
        }
    });

    app.post("/api/generate-subtasks", verifyToken, checkAIUsage, async (req: any, res: any) => {
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
          "subtasks": ["subtask 1", "subtask 2", "subtask 3", ...],
          "confidenceScore": <number 0-100, where 100 is highest confidence in this breakdown>
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
                confidenceScore: 70,
                isFallback: true
            });
        }
    });

    app.post("/api/audio-journal", verifyToken, checkAIUsage, async (req: any, res: any) => {
        try {
            const {text, model} = req.body;
            const selectedModel = getValidModel(model);
            if (!text || typeof text !== 'string' || text.length > MAX_INPUT.journal) {
                return res.status(400).json({error: `Journal text is required and must be under ${MAX_INPUT.journal} characters.`});
            }
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

            res.json({summary: result.summary, createdTasks});
        } catch (err: any) {
            console.error(err);
            res.status(500).json({error: "Failed to process audio journal"});
        }
    });

    // --- Shared task extraction helper ---
    async function extractTasksFromText(text: string, model: string) {
        const prompt = `
    You are an intelligent productivity assistant. Analyze the following text and extract all actionable tasks.
    Text: "${text}"

    Return a JSON response exactly in this format, no markdown, no backticks:
    {
      "tasks": [
        {
          "title": "Clear action item",
          "description": "Any additional context mentioned",
          "priority": "high|medium|low",
          "deadlineHint": "optional: natural language like 'tomorrow', 'next week', or null"
        }
      ],
      "summary": "1-2 sentence summary of what was captured."
    }
    Only include genuine actionable items. If the text is purely informational with no tasks, return an empty tasks array.`;

        const response = await generateAIContent({
            model,
            contents: prompt,
            config: {responseMimeType: "application/json"}
        });

        let outText = response.text || "{}";
        outText = outText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(outText);
    }

    app.post("/api/capture", verifyToken, checkAIUsage, async (req: any, res: any) => {
        try {
            const {text, source = 'manual', model = ''} = req.body || {};
            const selectedModel = getValidModel(model);

            if (!text || typeof text !== 'string' || text.length < 5) {
                return res.status(400).json({error: "Text is required and must be at least 5 characters."});
            }
            if (text.length > 5000) {
                return res.status(413).json({error: "Text must be under 5000 characters."});
            }

            const result = await extractTasksFromText(text, selectedModel);
            const createdTasks = [];

            if (result.tasks && Array.isArray(result.tasks)) {
                for (const t of result.tasks) {
                    // Parse deadlineHint into a rough ISO date
                    let deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    if (t.deadlineHint) {
                        const hint = t.deadlineHint.toLowerCase();
                        if (hint.includes('today')) {
                            deadline = new Date().toISOString();
                        } else if (hint.includes('tomorrow')) {
                            deadline = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
                        } else if (hint.includes('next week')) {
                            deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                        } else if (hint.includes('next month')) {
                            deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                        }
                    }

                    const newTask = new Task({
                        userId: req.uid,
                        title: t.title,
                        description: t.description || "",
                        priority: t.priority || "medium",
                        status: "pending",
                        category: "Captured",
                        estimatedHours: 1,
                        deadline,
                        resources: [`Captured from: ${source}`]
                    });
                    await newTask.save();
                    createdTasks.push(newTask);
                }
            }

            res.json({captured: createdTasks.length, tasks: createdTasks, summary: result.summary || ''});
        } catch (err: any) {
            console.error("[capture] Error:", err);
            res.status(500).json({error: "Failed to capture tasks from text."});
        }
    });

    app.post("/api/generate-plan", verifyToken, checkAIUsage, async (req: any, res: any) => {
        const {tasks = [], date = '', model = ''} = req.body || {};
        try {
            await connectDB();
            const selectedModel = getValidModel(model);

            if (JSON.stringify(tasks).length > MAX_INPUT.plan) {
                return res.status(413).json({error: "Too many tasks. Please reduce the task list."});
            }

            // Phase 2.1 — fetch or compute energy profile for energy-aware scheduling
            const user = await User.findById(req.uid).select('energyProfile');
            let energyProfile = user?.energyProfile;
            if (!energyProfile?.computedAt || (Date.now() - new Date(energyProfile.computedAt).getTime()) > 7 * 24 * 60 * 60 * 1000) {
                energyProfile = await computeEnergyProfile(req.uid);
            }
            const energyContext = energyProfile?.peakWindows?.length
                ? `\nUser's energy profile: Peak focus windows = ${energyProfile.peakWindows.join(', ')}. Low energy windows = ${energyProfile.lowWindows.join(', ')}. Schedule deep-focus/high-estimatedHours tasks inside peak windows; schedule low-effort/admin tasks inside low windows.`
                : '';

            const currentPlan = await DailyPlanModel.findOne({userId: req.uid, date});
            if (!currentPlan || !currentPlan.sessions || currentPlan.sessions.length === 0) {
                return res.status(400).json({error: "No timetable found for today. Please go to Timetable and generate a daily routine first."});
            }

            // --- Pacing feedback loop ---
            // Check yesterday's PACED_SUBTASKS sessions. If any were not completed, carry
            // those subtasks forward with a note so the AI bumps their priority today.
            const yesterday = new Date(date);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = localDateStr(yesterday);
            const carryForward: { taskId: string; taskTitle: string; subtaskIds: string[] }[] = [];
            if (yesterdayStr !== date) {
                const yesterdayPlan = await DailyPlanModel.findOne({userId: req.uid, date: yesterdayStr});
                if (yesterdayPlan?.sessions) {
                    for (const s of yesterdayPlan.sessions) {
                        if (s.schedulingMode === 'PACED_SUBTASKS' && !s.completed && s.subtaskIds?.length) {
                            carryForward.push({taskId: s.taskId, taskTitle: s.taskTitle, subtaskIds: s.subtaskIds});
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
            const goals = await Goal.find({userId: req.uid});
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
                    subtasks: incompleteSubtasks.map((st: any) => ({id: st.id, title: st.title}))
                };
            });

            const prompt = `
        You are an autonomous AI planning assistant.
        Your job is to schedule the user's pending tasks into their EXISTING daily timetable, at SUBTASK granularity wherever a task has subtasks.
        ${energyContext}
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
          ],
          "reason": "<1-2 sentence explanation of the scheduling rationale — why tasks were placed in these specific slots>"
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
                        ...(sessionLabel ? {sessionLabel} : {sessionLabel: undefined})
                    };
                });

                result.sessions = mergedSessions;
                await DailyPlanModel.findOneAndUpdate(
                    {userId: req.uid, date},
                    {$set: {sessions: mergedSessions, updatedAt: new Date()}},
                    {new: true}
                );
            }

            res.json(result);
        } catch (err: any) {
            console.error("Gemini Plan Generation failed:", err);
            res.status(500).json({error: "Failed to schedule tasks. Timetable may be empty."});
        }
    });

    app.post("/api/chat", verifyToken, chatLimiter, checkAIUsage, async (req: any, res: any) => {
        try {
            const {messages, context, model, localDateStr, localTimeStr} = req.body;
            const selectedModel = getValidModel(model);

            // Input size guard
            const msgStr = JSON.stringify(messages || []);
            if (msgStr.length > MAX_INPUT.chat) {
                return res.status(413).json({error: "Input too large. Please shorten your messages."});
            }

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
                            {userId: req.uid, date: todayDateStr},
                            {$set: {sessions: formattedSessions, updatedAt: new Date()}},
                            {upsert: true, new: true}
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

            res.json({text, planUpdated});

            // Phase 3.2 — Fire-and-forget: extract knowledge entities from user's last message
            try {
                const lastUserMsg = (messages || []).filter((m: any) => m.role === 'user').pop();
                if (lastUserMsg?.content && lastUserMsg.content.length > 20) {
                    const kgPrompt = `Extract people, projects, and commitments from this text. Return JSON: { "entities": [{"type":"person|project|topic","name":"...","aliases":[]}], "commitments": [{"from":"...","to":"...","relation":"..."}] }. Text: "${lastUserMsg.content.slice(0, 500)}"`;
                    const kgResponse = await generateAIContent({model: selectedModel, contents: kgPrompt});
                    const kgText = (kgResponse.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
                    const kgData = JSON.parse(kgText);
                    if (kgData.entities?.length || kgData.commitments?.length) {
                        const ents = kgData.entities || [];
                        const upsertedNames = new Map<string, string>();
                        for (const ent of ents) {
                            if (!ent.name) continue;
                            const existing = await KnowledgeEntity.findOne({
                                userId: req.uid,
                                type: ent.type,
                                name: ent.name
                            });
                            if (existing) upsertedNames.set(ent.name, existing._id.toString());
                            else {
                                const created = await KnowledgeEntity.create({
                                    userId: req.uid,
                                    type: ent.type,
                                    name: ent.name,
                                    aliases: ent.aliases || []
                                });
                                upsertedNames.set(ent.name, created._id.toString());
                            }
                        }
                        for (const c of kgData.commitments || []) {
                            const fromId = upsertedNames.get(c.from);
                            const toId = upsertedNames.get(c.to);
                            if (fromId && toId) {
                                await KnowledgeEdge.create({
                                    userId: req.uid,
                                    fromEntityId: fromId,
                                    toEntityId: toId,
                                    relation: c.relation || 'commits_to',
                                    sourceType: 'chat',
                                    sourceId: null
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                // Silent fail — knowledge extraction is best-effort
            }
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

    app.post("/api/autonomous-pipeline", verifyToken, requireTier('pro_plus'), checkAIUsage, async (req: any, res: any) => {
        const userId = req.uid;
        const {
            eventName = '',
            eventDetail = '',
            tasks = [],
            model = '',
            dayDescription = '',
            localDateStr = '',
            localTimeStr = ''
        } = req.body || {};
        try {
            const selectedModel = getValidModel(model);
            if (JSON.stringify(tasks).length + dayDescription.length > MAX_INPUT.plan) {
                return res.status(413).json({error: "Input too large. Please reduce tasks or description."});
            }

            // Phase 2.1 — fetch or compute energy profile
            const userDoc = await User.findById(userId).select('energyProfile');
            let energyProfile = userDoc?.energyProfile;
            if (!energyProfile?.computedAt || (Date.now() - new Date(energyProfile.computedAt).getTime()) > 7 * 24 * 60 * 60 * 1000) {
                energyProfile = await computeEnergyProfile(userId);
            }
            const energyContext = energyProfile?.peakWindows?.length
                ? `\nUser's energy profile: Peak focus windows = ${energyProfile.peakWindows.join(', ')}. Low energy windows = ${energyProfile.lowWindows.join(', ')}. Schedule deep-focus/high-estimatedHours tasks inside peak windows; schedule low-effort/admin tasks inside low windows.`
                : '';

            const prompt = `
        You are an autonomous AI Productivity Agent designing a General Daily Timetable of Total Discipline.
        The timeline MUST be a complete structured routine representing a perfectly disciplined day, covering activities from wake-up to sleeping time.
        ${energyContext}
        
        An event just occurred: "${eventName}"
        Details: "${eventDetail}"
        User's Current Local Time: ${localTimeStr || new Date().toLocaleTimeString()}
        User's Current Local Date: ${localDateStr || new Date().toISOString().split('T')[0]}
        
        USER'S DAY DESCRIPTION & PREFERENCES:
        ${dayDescription ? `"${dayDescription}"` : "None specified. Design a classic balanced high-discipline routine."}
        
        Active Quests/Tasks to integrate:
        ${JSON.stringify(tasks.map((t: any) => ({
                title: t.title,
                priority: t.priority,
                estimatedHours: t.estimatedHours,
                riskScore: t.riskScore
            })))}
        
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
                    const existingPlan = await DailyPlanModel.findOne({userId, date: todayDateStr});
                    if (existingPlan && existingPlan.sessions?.length > 0) {
                        // Build a lookup: sessions that were started or completed, keyed by
                        // taskTitle + start time so we can match them to the new AI output.
                        const progressMap = new Map<string, { started: boolean; completed: boolean }>();
                        for (const es of existingPlan.sessions) {
                            if (es.started || es.completed) {
                                const key = `${es.taskTitle}__${es.startTime}`;
                                progressMap.set(key, {started: !!es.started, completed: !!es.completed});
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
                        {userId, date: todayDateStr},
                        {$set: {sessions: formattedSessions, updatedAt: new Date()}},
                        {upsert: true, new: true}
                    );
                } else if (tasks.length === 0) {
                    await DailyPlanModel.findOneAndUpdate(
                        {userId, date: todayDateStr},
                        {$set: {sessions: [], updatedAt: new Date()}},
                        {upsert: true, new: true}
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
                    {userId, date: baseDateStr},
                    {
                        $set: {
                            sessions: fallbackSessions.map(s => ({
                                taskId: "temp-task-id",
                                taskTitle: s.taskTitle,
                                startTime: s.startTime,
                                endTime: s.endTime
                            })), updatedAt: new Date()
                        }
                    },
                    {upsert: true, new: true}
                );
            } catch (dbErr) {
                console.warn("Could not save programmatic fallback plan to MongoDB:", dbErr);
            }

            res.json({
                decision: fallbackDecision,
                plan: {sessions: fallbackSessions}
            });
        }
    });

    // ─── Focus Zone Endpoints ──────────────────────────────────────────────────

    // POST /api/focus-sessions — log a completed focus session
    app.post("/api/focus-sessions", verifyToken, async (req: any, res: any) => {
        try {
            const userId = req.uid;
            const {
                method,
                taskTitle,
                taskId,
                startedAt,
                endedAt,
                plannedDuration,
                actualDuration,
                breaks,
                qualityRating,
                note,
                completed
            } = req.body;

            // Input validation
            if (!['pomodoro', 'flowtime', '52-17', 'ultradian', 'custom'].includes(method)) {
                return res.status(400).json({error: "Invalid focus method"});
            }
            if (!startedAt || !endedAt) {
                return res.status(400).json({error: "startedAt and endedAt are required"});
            }
            if (typeof actualDuration !== 'number' || actualDuration <= 0) {
                return res.status(400).json({error: "actualDuration must be a positive number"});
            }
            if (actualDuration > 43200) { // 12 hours max
                return res.status(400).json({error: "actualDuration exceeds maximum (12 hours)"});
            }
            if (qualityRating != null && (qualityRating < 1 || qualityRating > 5)) {
                return res.status(400).json({error: "qualityRating must be between 1 and 5"});
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
                const methodBonus: Record<string, number> = {
                    ultradian: 5,
                    '52-17': 3,
                    pomodoro: 0,
                    flowtime: 2,
                    custom: 1
                };
                xpEarned += methodBonus[method] || 0;
                // Streak multiplier: +10% per streak day (max +50%)
                const streakMultiplier = 1 + Math.min((gamification.focusStreak || 0) * 0.1, 0.5);
                xpEarned = Math.round(xpEarned * streakMultiplier);

                // Focus streak: compute from current value
                const today = new Date().toISOString().slice(0, 10);
                const focusLastActive = gamification.focusLastActiveDate;
                let newFocusStreak = gamification.focusStreak || 0;
                if (focusLastActive) {
                    const lastDate = new Date(focusLastActive + "T00:00:00Z");
                    const todayDate = new Date(today + "T00:00:00Z");
                    const diffDays = Math.floor(Math.abs(todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) newFocusStreak += 1;
                    else if (diffDays > 1) newFocusStreak = 1;
                } else {
                    newFocusStreak = 1;
                }
                const newLongest = Math.max(gamification.longestFocusStreak || 0, newFocusStreak);

                // Level-up
                let xp = (gamification.xp || 0) + xpEarned;
                let level = gamification.level || 1;
                let levelUp = null;
                while (xp >= level * 200) {
                    level += 1;
                    levelUp = level;
                }

                // Atomic update: counters via $inc, streak/level via $set, badges via $addToSet
                const incFields: any = {
                    'gamification.xp': xpEarned,
                    'gamification.totalFocusMinutes': durationMins,
                    'gamification.focusSessionsCompleted': 1
                };
                const setFields: any = {
                    'gamification.focusStreak': newFocusStreak,
                    'gamification.longestFocusStreak': newLongest,
                    'gamification.focusLastActiveDate': today,
                    'gamification.level': level
                };

                // Badge checks
                const newBadges: string[] = [];
                const addBadge = (id: string, condition: boolean) => {
                    if (condition && !(gamification.earnedBadges || []).includes(id)) {
                        newBadges.push(id);
                    }
                };
                addBadge('focus_3', newFocusStreak >= 3);
                addBadge('focus_7', newFocusStreak >= 7);
                addBadge('focus_30', newFocusStreak >= 30);
                addBadge('focus_100', newFocusStreak >= 100);
                addBadge('focus_10_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 10);
                addBadge('focus_50_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 50);
                addBadge('focus_100_sessions', (gamification.focusSessionsCompleted || 0) + 1 >= 100);
                addBadge('focus_10_hours', (gamification.totalFocusMinutes || 0) + durationMins >= 600);
                addBadge('focus_100_hours', (gamification.totalFocusMinutes || 0) + durationMins >= 6000);

                const updateOp: any = {$inc: incFields, $set: setFields};
                if (newBadges.length > 0) {
                    updateOp.$addToSet = {'gamification.earnedBadges': {$each: newBadges}};
                }

                const updatedUser = await User.findByIdAndUpdate(userId, updateOp, {new: true});

                return res.json({
                    session: sessionObj,
                    gamification: {xpEarned, newBadges, levelUp, focusStreak: newFocusStreak}
                });
            }

            res.json({session: sessionObj, gamification: null});
        } catch (e: any) {
            console.error("Focus session save error:", e);
            res.status(500).json({error: "Failed to save focus session"});
        }
    });

    // GET /api/focus-sessions/stats — aggregated focus statistics
    // NOTE: Defined BEFORE the generic /api/focus-sessions route so Express
    // matches the more specific path first.
    app.get("/api/focus-sessions/stats", verifyToken, async (req: any, res: any) => {
        try {
            const userId = req.uid;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const weekStart = new Date(now);
            const dayOfWeek = now.getDay();
            const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            weekStart.setDate(now.getDate() - daysSinceMonday);
            weekStart.setHours(0, 0, 0, 0);

            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const yearAgo = new Date(now);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);

            const matchStage = {userId, startedAt: {$gte: yearAgo}};

            const [aggResult] = await FocusSessionModel.aggregate([
                {$match: matchStage},
                {
                    $addFields: {
                        mins: {$round: [{$divide: ['$actualDuration', 60]}, 0]},
                        dateStr: {$dateToString: {format: '%Y-%m-%d', date: '$startedAt'}},
                        isToday: {$eq: [{$dateToString: {format: '%Y-%m-%d', date: '$startedAt'}}, todayStr]},
                        isWeek: {$gte: ['$startedAt', weekStart]},
                        isMonth: {$gte: ['$startedAt', monthStart]},
                    }
                },
                {
                    $facet: {
                        methodBreakdown: [
                            {$group: {_id: '$method', total: {$sum: '$mins'}}}
                        ],
                        heatmap: [
                            {$group: {_id: '$dateStr', total: {$sum: '$mins'}}},
                            {$project: {_id: 0, day: '$_id', total: 1}}
                        ],
                        today: [
                            {$match: {isToday: true}},
                            {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                        ],
                        week: [
                            {$match: {isWeek: true}},
                            {
                                $group: {
                                    _id: {$dateToString: {format: '%a', date: '$startedAt'}},
                                    minutes: {$sum: '$mins'}
                                }
                            }
                        ],
                        weekTotals: [
                            {$match: {isWeek: true}},
                            {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                        ],
                        month: [
                            {$match: {isMonth: true}},
                            {$group: {_id: null, minutes: {$sum: '$mins'}, count: {$sum: 1}}}
                        ],
                    }
                }
            ]);

            const todayData = aggResult.today[0] || {minutes: 0, count: 0};
            const weekData = aggResult.weekTotals[0] || {minutes: 0, count: 0};
            const monthData = aggResult.month[0] || {minutes: 0, count: 0};

            const byMethod: Record<string, number> = {pomodoro: 0, flowtime: 0, '52-17': 0, ultradian: 0, custom: 0};
            for (const m of aggResult.methodBreakdown) {
                if (byMethod.hasOwnProperty(m._id)) byMethod[m._id] = m.total;
                else byMethod[m._id] = m.total;
            }

            const heatmap: Record<string, number> = {};
            for (const h of aggResult.heatmap) heatmap[h.day] = h.total;

            const dailyWeek: Record<string, number> = {};
            for (const d of aggResult.week) dailyWeek[d._id] = d.minutes;

            const user = await User.findById(userId);
            const focusStreak = user?.gamification?.focusStreak || 0;
            const longestFocusStreak = user?.gamification?.longestFocusStreak || 0;
            const totalFocusMinutes = user?.gamification?.totalFocusMinutes || 0;
            const totalFocusSessions = user?.gamification?.focusSessionsCompleted || 0;

            res.json({
                todayMinutes: todayData.minutes, todaySessions: todayData.count,
                weekMinutes: weekData.minutes, weekSessions: weekData.count,
                monthMinutes: monthData.minutes, monthSessions: monthData.count,
                focusStreak, longestFocusStreak,
                totalFocusMinutes, totalFocusSessions,
                byMethod, heatmap, dailyWeek
            });
        } catch (e: any) {
            console.error("Focus stats error:", e);
            res.status(500).json({error: "Failed to fetch focus stats"});
        }
    });

    // GET /api/focus-sessions/heatmap — monthly heatmap data
    app.get("/api/focus-sessions/heatmap", verifyToken, async (req: any, res: any) => {
        try {
            const userId = req.uid;
            const {month} = req.query;
            const now = new Date();
            const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Validate month format
            if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
                return res.status(400).json({error: "Invalid month format. Use YYYY-MM."});
            }

            const [year, mon] = targetMonth.split('-').map(Number);
            if (isNaN(year) || isNaN(mon) || mon < 1 || mon > 12) {
                return res.status(400).json({error: "Invalid month values."});
            }

            const monthStart = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
            const monthEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

            const sessions = await FocusSessionModel.find({
                userId,
                startedAt: {$gte: monthStart, $lte: monthEnd}
            });

            const heatmap: Record<string, number> = {};
            for (const s of sessions) {
                const d = new Date(s.startedAt);
                const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                heatmap[day] = (heatmap[day] || 0) + Math.round((s.actualDuration || 0) / 60);
            }

            res.json({month: targetMonth, heatmap});
        } catch (e: any) {
            console.error("Focus heatmap error:", e);
            res.status(500).json({error: "Failed to fetch heatmap"});
        }
    });

    // GET /api/focus-sessions — fetch focus history with optional filters
    // NOTE: This generic route MUST come after /stats and /heatmap so those
    // specific paths are matched first by Express.
    app.get("/api/focus-sessions", verifyToken, async (req: any, res: any) => {
        try {
            const userId = req.uid;
            const {from, to, method, limit: limitStr} = req.query;
            const filter: any = {userId};
            if (method) filter.method = method;
            if (from || to) {
                filter.startedAt = {};
                if (from) filter.startedAt.$gte = new Date(from);
                if (to) filter.startedAt.$lte = new Date(to);
            }
            const rawSessions = await FocusSessionModel.find(filter)
                .sort({startedAt: -1})
                .limit(parseInt(limitStr) || 100);
            // Normalize Mongoose documents
            const sessions = rawSessions.map((s: any) => {
                const obj = s.toObject();
                obj.id = obj._id.toString();
                delete obj._id;
                delete obj.__v;
                return obj;
            });
            res.json({sessions});
        } catch (e: any) {
            console.error("Focus sessions fetch error:", e);
            res.status(500).json({error: "Failed to fetch focus sessions"});
        }
    });


    // On Vercel, requests are routed to the exported handler below instead of a
    // listening port — Vercel sets VERCEL=1 in its build/runtime environment.

    // ─── Binaural Sounds API (Premium Feature) ──────────────────────────────────

    // Binaural sound definitions - served only to premium users
    const BINAURAL_SOUNDS = [
        {id: 'delta', label: 'Delta (2 Hz)', category: 'binaural', freqL: 200, freqR: 202},
        {id: 'theta', label: 'Theta (6 Hz)', category: 'binaural', freqL: 200, freqR: 206},
        {id: 'alpha', label: 'Alpha (10 Hz)', category: 'binaural', freqL: 200, freqR: 210},
        {id: 'beta', label: 'Beta (20 Hz)', category: 'binaural', freqL: 200, freqR: 220},
        {id: 'gamma', label: 'Gamma (40 Hz)', category: 'binaural', freqL: 200, freqR: 240},
    ];

    // Check premium status for sounds
    app.get("/api/sounds/binaural/status", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('isPremium premiumExpiry');
            if (!user) return res.status(404).json({error: 'User not found'});

            const now = new Date();
            const isExpired = user.premiumExpiry && user.premiumExpiry < now;
            const isActive = user.isPremium && !isExpired;

            res.json({
                isPremium: isActive,
                premiumExpiry: user.premiumExpiry,
            });
        } catch (error: any) {
            console.error('Sound status check error:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // Get binaural sounds - requires premium
    app.get("/api/sounds/binaural", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('isPremium premiumExpiry');
            if (!user) return res.status(404).json({error: 'User not found'});

            const now = new Date();
            const isExpired = user.premiumExpiry && user.premiumExpiry < now;
            const isPremium = user.isPremium && !isExpired;

            if (!isPremium) {
                return res.status(403).json({
                    error: 'Premium required',
                    message: 'Binaural sounds require a Premium subscription'
                });
            }

            res.json({sounds: BINAURAL_SOUNDS});
        } catch (error: any) {
            console.error('Binaural sounds fetch error:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Premium Subscription System ─────────────────────────────────────────────

    // Default pricing seed data
    const DEFAULT_PRICING: any[] = [
        {
            planId: 'pro_monthly',
            name: 'Pro',
            description: 'Smarter organization with AI assistance',
            basePrice: 199,
            interval: 'month' as const,
            features: [
                'Unlimited projects, quests, habits',
                'AI task creation & subtask generation',
                'AI priority suggestions',
                'AI chat assistant',
                'Visual timeline view',
                'Task micro-stepper',
                'Dopamine menu',
                'Streak freezes',
                'Guided daily planning',
                'Transparent billing dashboard'
            ],
            popular: false
        },
        {
            planId: 'pro_annual',
            name: 'Pro Annual',
            description: 'Save 17% with annual billing',
            basePrice: 1990,
            interval: 'year' as const,
            features: [
                'All Pro features',
                '2 months free vs monthly',
                'Priority support'
            ],
            popular: false
        },
        {
            planId: 'pro_plus_monthly',
            name: 'Pro+',
            description: 'AI Executive Assistant — full autonomy',
            basePrice: 499,
            interval: 'month' as const,
            features: [
                'Everything in Pro',
                'Autonomous pipeline & auto-rescheduler',
                'Energy-matched scheduling',
                'Burnout detection',
                'Deadline risk predictions',
                'Scenario simulator',
                'Personal knowledge graph',
                'Shared projects with AI mediator',
                'Voice brain dump',
                'Unlimited AI usage (fair-use)'
            ],
            popular: true
        },
        {
            planId: 'pro_plus_annual',
            name: 'Pro+ Annual',
            description: 'Save 17% with annual billing',
            basePrice: 4990,
            interval: 'year' as const,
            features: [
                'All Pro+ features',
                '2 months free vs monthly',
                'Priority support'
            ],
            popular: false
        }
    ];

    let pricingSeeded = false;

    async function seedPricing() {
        if (pricingSeeded) return;
        try {
            await connectDB();
            const count = await PricingConfig.countDocuments();
            if (count === 0) {
                await PricingConfig.insertMany(DEFAULT_PRICING);
                console.log('Default pricing seeded');
            }
            pricingSeeded = true;
        } catch (err) {
            console.error('Pricing seed error:', err);
        }
    }

    seedPricing();

    async function getPricing(planId?: string) {
        await connectDB();
        if (planId) {
            return await PricingConfig.findOne({planId, enabled: true});
        }
        return await PricingConfig.find({enabled: true}).sort({basePrice: 1});
    }

    async function getEffectivePrice(planId: string): Promise<{ price: number; name: string }> {
        const plan = await getPricing(planId);
        if (!plan) {
            const fallback = DEFAULT_PRICING.find(p => p.planId === planId);
            return {price: fallback?.basePrice || 0, name: fallback?.name || planId};
        }
        const effectivePrice = plan.saleActive && plan.salePrice ? plan.salePrice : plan.basePrice;
        return {price: effectivePrice, name: plan.name};
    }

    // Public pricing endpoint (no auth needed)
    app.get("/api/pricing", async (req: any, res: any) => {
        try {
            const plans = await getPricing();
            res.json({plans});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: List all pricing configs (including disabled)
    app.get("/api/admin/pricing", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            await connectDB();
            const plans = await PricingConfig.find().sort({basePrice: 1});
            res.json({plans});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: Update pricing config
    app.put("/api/admin/pricing/:planId", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            const {planId} = req.params;
            const {
                basePrice,
                salePrice,
                saleActive,
                saleLabel,
                name,
                description,
                features,
                popular,
                enabled
            } = req.body;

            await connectDB();
            const plan = await PricingConfig.findOne({planId});
            if (!plan) return res.status(404).json({error: "Plan not found"});

            if (basePrice !== undefined) plan.basePrice = basePrice;
            if (salePrice !== undefined) plan.salePrice = salePrice;
            if (saleActive !== undefined) plan.saleActive = saleActive;
            if (saleLabel !== undefined) plan.saleLabel = saleLabel;
            if (name !== undefined) plan.name = name;
            if (description !== undefined) plan.description = description;
            if (features !== undefined) plan.features = features;
            if (popular !== undefined) plan.popular = popular;
            if (enabled !== undefined) plan.enabled = enabled;
            plan.updatedAt = new Date();

            await plan.save();
            res.json({success: true, plan});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: Create new pricing config
    app.post("/api/admin/pricing", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            const {
                planId,
                name,
                description,
                basePrice,
                salePrice,
                saleActive,
                saleLabel,
                interval,
                features,
                popular,
                enabled
            } = req.body;

            if (!planId || !name || !basePrice || !interval) {
                return res.status(400).json({error: "planId, name, basePrice, and interval are required"});
            }

            if (typeof basePrice !== 'number' || basePrice <= 0) {
                return res.status(400).json({error: "basePrice must be a positive number"});
            }

            if (!['month', 'year'].includes(interval)) {
                return res.status(400).json({error: "interval must be 'month' or 'year'"});
            }

            await connectDB();
            const existing = await PricingConfig.findOne({planId});
            if (existing) return res.status(400).json({error: "Plan ID already exists"});

            const plan = await PricingConfig.create({
                planId, name, description, basePrice, salePrice, saleActive, saleLabel,
                interval, features, popular, enabled
            });
            res.json({success: true, plan});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: Delete pricing config
    app.delete("/api/admin/pricing/:planId", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            await connectDB();
            await PricingConfig.findOneAndDelete({planId: req.params.planId});
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: Get all subscriptions overview
    app.get("/api/admin/subscriptions", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            await connectDB();
            const users = await User.find({isPremium: true})
                .select('email name isPremium premiumExpiry subscriptionPlan subscriptionActive subscriptions createdAt')
                .sort({createdAt: -1})
                .limit(100);
            const totalPremium = await User.countDocuments({isPremium: true});
            const totalRevenue = await User.aggregate([
                {$unwind: '$subscriptions'},
                {$group: {_id: null, total: {$sum: '$subscriptions.amount'}}}
            ]);
            res.json({
                users,
                stats: {
                    totalPremium,
                    totalRevenue: totalRevenue[0]?.total || 0
                }
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Admin: Make a user admin
    app.post("/api/admin/make-admin", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            const {email} = req.body;
            if (!email) return res.status(400).json({error: "Email is required"});
            await connectDB();
            const user = await User.findOne({email});
            if (!user) return res.status(404).json({error: "User not found"});
            user.role = 'admin';
            await user.save();
            res.json({success: true, message: `${email} is now an admin`});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // POST /api/admin/expire-subscriptions — Expire overdue subscriptions (call daily via cron)
    app.post("/api/admin/expire-subscriptions", verifyToken, requireAdmin, async (req: any, res: any) => {
        try {
            await connectDB();
            const now = new Date();
            // Bulk expire user flags
            const result = await User.updateMany(
                {isPremium: true, premiumExpiry: {$lt: now}},
                {$set: {isPremium: false, subscriptionActive: false, tier: 'free', tierExpiry: null}}
            );
            // Bulk expire subscription entries using array filters
            await User.updateMany(
                {'subscriptions.status': 'active'},
                {$set: {'subscriptions.$[elem].status': 'expired'}},
                {arrayFilters: [{'elem.status': 'active', 'elem.expiry': {$lt: now}}]}
            );
            res.json({success: true, expired: result.modifiedCount});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    function generateTransactionId() {
        return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    app.post("/api/subscriptions/create-order", verifyToken, paymentLimiter, async (req: any, res: any) => {
        try {
            const {plan} = req.body;
            const VALID_PLANS = ['pro_monthly', 'pro_annual', 'pro_plus_monthly', 'pro_plus_annual'];
            if (!plan || !VALID_PLANS.includes(plan)) {
                return res.status(400).json({error: `Invalid plan. Use one of: ${VALID_PLANS.join(', ')}`});
            }

            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            const razorPayKey = process.env.RAZORPAY_KEY_ID;
            const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

            if (!razorPayKey || !razorPaySecret) {
                console.error("Razorpay credentials not configured");
                return res.status(500).json({error: "Payment gateway not configured"});
            }

            const {price: effectivePrice, name: planName} = await getEffectivePrice(plan);
            if (effectivePrice <= 0) {
                return res.status(400).json({error: "Plan is not available for purchase"});
            }
            // Math.round guards against floating-point artifacts (e.g. 149.99 * 100
            // can come out to 14998.999999999998 in JS). Razorpay's `amount` field
            // must be an integer number of paise, or the Orders API rejects the
            // request with a 400 (which previously surfaced only as the generic
            // "Failed to create order" fallback below).
            const amountInPaise = Math.round(effectivePrice * 100);
            // Razorpay's minimum order amount for INR is ₹1 (100 paise). Catching
            // this here gives a clear message instead of a cryptic Razorpay 400.
            if (amountInPaise < 100) {
                return res.status(400).json({error: "Plan price is below the minimum payable amount."});
            }
            const transactionId = generateTransactionId();

            const orderData = {
                amount: amountInPaise,
                currency: 'INR',
                receipt: transactionId,
                notes: {
                    userId: user._id.toString(),
                    plan: plan
                }
            };

            const response = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${razorPayKey}:${razorPaySecret}`).toString('base64'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                let err: any = {};
                try {
                    err = JSON.parse(text);
                } catch {
                }
                // Log the full Razorpay response server-side so the real cause (bad
                // key/secret pairing, test/live mismatch, amount below minimum, etc.)
                // is visible in logs instead of being hidden behind the generic
                // client-facing message.
                console.error('Razorpay order creation failed:', response.status, text);
                throw new Error(err?.error?.description || `Failed to create order (Razorpay returned HTTP ${response.status})`);
            }

            const order = await response.json();

            // Persist the order server-side BEFORE returning it to the browser.
            // This is our source of truth for plan/amount at verification time —
            // we must never trust the `plan` a client sends back to /verify.
            if (!user.subscriptions) user.subscriptions = [];
            user.subscriptions.push({
                plan,
                amount: effectivePrice,
                currency: 'INR',
                orderId: order.id,
                transactionId,
                status: 'pending',
                startedAt: new Date()
            });
            await user.save();

            res.json({
                orderId: order.id,
                amount: orderData.amount,
                currency: 'INR',
                keyId: razorPayKey,
                plan: planName,
                transactionId
            });
        } catch (error: any) {
            console.error("Create subscription order error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // Create Razorpay Payment Link endpoint
    app.post("/api/subscriptions/payment-link", verifyToken, paymentLimiter, async (req: any, res: any) => {
        try {
            const {plan} = req.body;
            const VALID_PLANS = ['pro_monthly', 'pro_annual', 'pro_plus_monthly', 'pro_plus_annual'];
            if (!plan || !VALID_PLANS.includes(plan)) {
                return res.status(400).json({error: `Invalid plan. Use one of: ${VALID_PLANS.join(', ')}`});
            }

            await connectDB();
            const user = await User.findById(req.uid);
            if (!user) return res.status(404).json({error: "User not found"});

            const razorPayKey = process.env.RAZORPAY_KEY_ID;
            const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

            if (!razorPayKey || !razorPaySecret) {
                return res.status(500).json({error: "Payment gateway not configured"});
            }

            const {price: effectivePrice, name: planName} = await getEffectivePrice(plan);
            if (effectivePrice <= 0) {
                return res.status(400).json({error: "Plan is not available for purchase"});
            }
            const amountInPaise = Math.round(effectivePrice * 100);
            if (amountInPaise < 100) {
                return res.status(400).json({error: "Plan price is below the minimum payable amount."});
            }
            const transactionId = generateTransactionId();

            // Create payment link via Razorpay API
            const plResponse = await fetch('https://api.razorpay.com/v1/payment_links', {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${razorPayKey}:${razorPaySecret}`).toString('base64'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amountInPaise,
                    currency: 'INR',
                    description: `${planName} - TaskPilot AI Premium`,
                    notes: {
                        userId: user._id.toString(),
                        plan,
                        transactionId
                    },
                    callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`,
                    callback_method: 'get'
                })
            });

            if (!plResponse.ok) {
                const text = await plResponse.text().catch(() => '');
                let err: any = {};
                try {
                    err = JSON.parse(text);
                } catch {
                }
                console.error('Razorpay payment link creation failed:', plResponse.status, text);
                throw new Error(err?.error?.description || `Failed to create payment link (Razorpay returned HTTP ${plResponse.status})`);
            }

            const paymentLink = await plResponse.json();

            // Store payment link info with user for webhook matching
            if (!user.subscriptions) user.subscriptions = [];
            user.subscriptions.push({
                plan,
                amount: effectivePrice,
                currency: 'INR',
                orderId: paymentLink.order_id,
                paymentLinkId: paymentLink.id,
                transactionId,
                status: 'pending',
                startedAt: new Date()
            });
            await user.save();

            res.json({
                paymentLinkId: paymentLink.id,
                shortUrl: paymentLink.short_url,
                paymentLink: paymentLink.short_url
            });
        } catch (error: any) {
            console.error("Create payment link error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/subscriptions/verify", verifyToken, paymentLimiter, async (req: any, res: any) => {
        try {
            const {orderId, paymentId, signature} = req.body;

            if (!orderId || !paymentId || !signature) {
                return res.status(400).json({error: "Missing required fields"});
            }

            const razorPayKey = process.env.RAZORPAY_KEY_ID;
            const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

            if (!razorPayKey || !razorPaySecret) {
                return res.status(500).json({error: "Payment gateway not configured"});
            }

            // Signature = HMAC-SHA256(order_id + "|" + payment_id), keyed with our Key Secret.
            const payload = orderId + '|' + paymentId;
            const expectedSignature = crypto.createHmac('sha256', razorPaySecret)
                .update(payload)
                .digest('hex');

            let sigBuf: Buffer, expectedBuf: Buffer;
            try {
                sigBuf = Buffer.from(signature, 'hex');
                expectedBuf = Buffer.from(expectedSignature, 'hex');
            } catch {
                return res.status(400).json({error: "Invalid signature"});
            }
            if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                return res.status(400).json({error: "Invalid signature"});
            }

            await connectDB();

            // CRITICAL: look up the order in OUR OWN database by orderId, and take
            // the plan/amount from THAT record — never from the client-supplied
            // `plan` field. The signature only binds order_id + payment_id, so if we
            // trusted a client-supplied plan here, a user could pay for the cheap
            // monthly plan and then call /verify claiming plan=annual to get the
            // annual plan activated for the monthly price.
            const user = await User.findOne({_id: req.uid, 'subscriptions.orderId': orderId});
            if (!user) {
                return res.status(404).json({error: "No matching order found for this user. Please start checkout again."});
            }

            const orderRecord = (user.subscriptions || []).find((s: any) => s.orderId === orderId);
            if (!orderRecord) {
                return res.status(404).json({error: "Order record not found."});
            }

            if (orderRecord.status === 'active' || orderRecord.paymentId) {
                return res.json({
                    success: true,
                    isPremium: true,
                    premiumExpiry: user.premiumExpiry,
                    message: "Subscription already active."
                });
            }

            const plan = orderRecord.plan;
            const amount = orderRecord.amount;

            const now = new Date();
            const expiryDate = new Date(now.getTime() + (plan.includes('annual') ? 365 : 30) * 24 * 60 * 60 * 1000);

            // Atomic update: only transition THIS order's array entry from
            // non-active to active, using arrayFilters + a condition on the current
            // status so a concurrent request (or webhook) can't double-activate it.
            const updateResult = await User.findOneAndUpdate(
                {_id: user._id, subscriptions: {$elemMatch: {orderId, status: {$ne: 'active'}}}},
                {
                    $set: {
                        isPremium: true,
                        premiumExpiry: expiryDate,
                        tier: tierFromPlan(plan),
                        tierExpiry: expiryDate,
                        subscriptionId: paymentId,
                        subscriptionPlan: plan,
                        subscriptionActive: true,
                        'subscriptions.$[elem].status': 'active',
                        'subscriptions.$[elem].paymentId': paymentId,
                        'subscriptions.$[elem].amount': amount,
                        'subscriptions.$[elem].expiry': expiryDate
                    }
                },
                {arrayFilters: [{'elem.orderId': orderId}], new: true}
            );

            if (!updateResult) {
                // Either user not found or orderId already exists — idempotent response
                const refreshed = await User.findById(user._id);
                return res.json({
                    success: true,
                    isPremium: true,
                    premiumExpiry: refreshed?.premiumExpiry,
                    message: "Subscription already active."
                });
            }

            res.json({
                success: true,
                isPremium: true,
                premiumExpiry: expiryDate.toISOString(),
                message: "Subscription activated successfully!"
            });
        } catch (error: any) {
            console.error("Verify subscription error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/subscriptions/cancel", verifyToken, paymentLimiter, async (req: any, res: any) => {
        try {
            await connectDB();

            // Atomic: mark last subscription as cancelled
            const userAfterCancel = await User.findOneAndUpdate(
                {_id: req.uid, isPremium: true, subscriptionId: {$ne: null}},
                {
                    $set: {'subscriptions.$[lastSub].status': 'cancelled'},
                    $unset: {subscriptionId: '', subscriptionPlan: ''}
                },
                {
                    arrayFilters: [{'lastSub.status': 'active'}],
                    new: true
                }
            );

            if (!userAfterCancel) {
                return res.status(400).json({error: "No active subscription found"});
            }

            // Check if there's another active sub still
            const hasUpcomingSub = userAfterCancel.subscriptions?.some(
                (s: any) => s.status === 'active' && new Date(s.expiry) > new Date()
            );

            if (!hasUpcomingSub) {
                await User.findOneAndUpdate(
                    {_id: req.uid},
                    {$set: {isPremium: false, premiumExpiry: null}, $unset: {tier: '', tierExpiry: ''}}
                );
                res.json({
                    success: true,
                    isPremium: false,
                    message: "Subscription cancelled. Premium features have been removed."
                });
            } else {
                res.json({
                    success: true,
                    isPremium: true,
                    message: "Subscription cancelled. Premium features remain active until the current period ends."
                });
            }
        } catch (error: any) {
            console.error("Cancel subscription error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/subscriptions/status", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('isPremium premiumExpiry tier tierExpiry subscriptionPlan subscriptions');
            if (!user) return res.status(404).json({error: "User not found"});

            const now = new Date();
            const isExpired = user.premiumExpiry && user.premiumExpiry < now;
            const isActive = user.isPremium && !isExpired;

            // Auto-expire: if DB says active but expiry has passed, clean up atomically
            if (user.isPremium && isExpired) {
                await User.updateOne(
                    {_id: user._id, isPremium: true},
                    {
                        $set: {
                            isPremium: false,
                            subscriptionActive: false,
                            updatedAt: now
                        },
                        $unset: {tier: '', tierExpiry: ''},
                        $push: {
                            subscriptions: {
                                $each: [{status: 'expired', expiry: user.premiumExpiry}],
                                $slice: -50
                            }
                        }
                    }
                );
            }

            // Find the active subscription entry
            const activeSub = (user.subscriptions || []).find((s: any) => s.status === 'active');
            const nextChargeDate = activeSub?.expiry || user.premiumExpiry || null;
            const nextChargeAmount = activeSub?.amount || (user.tier === 'pro_plus' ? 499 : user.tier === 'pro' ? 199 : 0);

            res.json({
                isPremium: isActive,
                tier: user.tier || (isActive && user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'free'),
                tierExpiry: user.tierExpiry,
                premiumExpiry: user.premiumExpiry,
                subscriptionPlan: user.subscriptionPlan,
                subscriptions: user.subscriptions || [],
                daysRemaining: user.premiumExpiry
                    ? Math.ceil((user.premiumExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : 0,
                nextChargeDate,
                nextChargeAmount
            });
        } catch (error: any) {
            console.error("Get subscription status error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Personal Access Tokens (PAT) ──────────────────────────────────────
    const PAT_PREFIX = 'tp_';
    const PAT_BYTE_LENGTH = 32;

    function hashPAT(raw: string): string {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    // List PATs
    app.get("/api/pat", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const pats = await PersonalAccessTokenModel.find({userId: req.uid})
                .select('name lastUsedAt expiresAt createdAt')
                .sort({createdAt: -1});
            res.json(pats.map((p: any) => ({
                id: p._id,
                name: p.name,
                lastUsedAt: p.lastUsedAt,
                expiresAt: p.expiresAt,
                createdAt: p.createdAt
            })));
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Create PAT
    app.post("/api/pat", verifyToken, async (req: any, res: any) => {
        try {
            const {name, expiresInDays} = req.body;
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({error: "Token name is required"});
            }
            if (name.length > 64) {
                return res.status(400).json({error: "Token name too long (max 64 chars)"});
            }

            // Limit active PATs per user
            await connectDB();

            // Validate expiresInDays
            const expiryDays = typeof expiresInDays === 'number' && expiresInDays > 0 ? Math.min(Math.floor(expiresInDays), 365) : null;

            const raw = PAT_PREFIX + crypto.randomBytes(PAT_BYTE_LENGTH).toString('hex');
            const tokenHash = hashPAT(raw);

            const expiresAt = expiryDays
                ? new Date(Date.now() + expiryDays * 86400000)
                : null;

            const pat = await PersonalAccessTokenModel.create({
                userId: req.uid,
                name: name.trim(),
                tokenHash,
                expiresAt
            });

            // Enforce 10-token cap — delete oldest excess (resolves race condition)
            const count = await PersonalAccessTokenModel.countDocuments({userId: req.uid});
            if (count > 10) {
                const excess = await PersonalAccessTokenModel.find({userId: req.uid})
                    .sort({createdAt: 1})
                    .limit(count - 10)
                    .select('_id');
                if (excess.length > 0) {
                    await PersonalAccessTokenModel.deleteMany({_id: {$in: excess.map((e: any) => e._id)}});
                }
            }

            // Return plaintext token once — it cannot be recovered later
            res.status(201).json({
                id: pat._id,
                name: pat.name,
                token: raw,
                expiresAt: pat.expiresAt,
                createdAt: pat.createdAt
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Revoke (delete) PAT
    app.delete("/api/pat/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const deleted = await PersonalAccessTokenModel.findOneAndDelete({
                _id: req.params.id,
                userId: req.uid
            });
            if (!deleted) return res.status(404).json({error: "Token not found"});
            res.json({message: "Token revoked"});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Verify PAT (browser extension login)
    app.post("/api/pat/verify", authLimiter, async (req: any, res: any) => {
        try {
            const {token} = req.body;
            if (!token || typeof token !== 'string') {
                return res.status(400).json({error: "Token is required"});
            }
            if (!token.startsWith(PAT_PREFIX)) {
                return res.status(401).json({error: "Invalid token format"});
            }

            const tokenHash = hashPAT(token);
            await connectDB();
            const pat = await PersonalAccessTokenModel.findOne({tokenHash});
            if (!pat) return res.status(401).json({error: "Invalid or revoked token"});

            // Check expiry
            if (pat.expiresAt && new Date(pat.expiresAt) < new Date()) {
                return res.status(401).json({error: "Token has expired"});
            }

            // Update lastUsedAt
            pat.lastUsedAt = new Date();
            await pat.save();

            // Issue a regular JWT so the rest of the app works unchanged
            const user = await User.findById(pat.userId);
            if (!user) return res.status(401).json({error: "User not found"});

            const jwtToken = jwt.sign({uid: user._id, tv: user.tokenVersion || 0}, JWT_SECRET, {expiresIn: '7d'});
            res.json({token: jwtToken});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Automation Dial Routes ─────────────────────────────────────────────
    app.get("/api/automation/settings", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('automationSettings');
            if (!user) return res.status(404).json({error: "User not found"});
            res.json({
                global: user.automationSettings?.global || 'suggest',
                perProject: user.automationSettings?.perProject || {}
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.put("/api/automation/settings", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {global: globalSetting, perProject} = req.body;

            // Resolve tier once for all 'auto' checks
            const user = await User.findById(req.uid).select('tier tierExpiry isPremium premiumExpiry subscriptionPlan');
            if (!user) return res.status(404).json({error: "User not found"});
            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium) {
                const isExpired = user.premiumExpiry && user.premiumExpiry < new Date();
                if (!isExpired) effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }

            // Check if any 'auto' setting is being requested
            const wantsAuto = globalSetting === 'auto' ||
                (perProject && typeof perProject === 'object' && Object.values(perProject).some(v => v === 'auto'));

            if (wantsAuto) {
                const order = {free: 0, pro: 1, pro_plus: 2};
                if (order[effectiveTier] < order['pro_plus']) {
                    return res.status(403).json({error: 'upgrade_required', requiredTier: 'pro_plus'});
                }
            }

            const update: any = {};
            if (globalSetting && ['suggest', 'auto', 'off'].includes(globalSetting)) {
                update['automationSettings.global'] = globalSetting;
            }
            if (perProject && typeof perProject === 'object') {
                for (const [key, value] of Object.entries(perProject)) {
                    if (['suggest', 'auto', 'off'].includes(value as string)) {
                        update[`automationSettings.perProject.${key}`] = value;
                    }
                }
            }

            await User.findByIdAndUpdate(req.uid, {$set: update});
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── AI Actions (Explainability + Undo) ─────────────────────────────────
    app.get("/api/ai-actions", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {status, page = 1, limit = 20} = req.query;
            const filter: any = {userId: req.uid};
            if (status) filter.status = status;
            const skip = (Number(page) - 1) * Number(limit);
            const [actions, total] = await Promise.all([
                AIAction.find(filter).sort({createdAt: -1}).skip(skip).limit(Number(limit)),
                AIAction.countDocuments(filter)
            ]);
            res.json({actions, total, page: Number(page), pages: Math.ceil(total / Number(limit))});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/ai-actions/:id/accept", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const action = await AIAction.findOneAndUpdate(
                {_id: req.params.id, userId: req.uid, status: 'pending_review'},
                {$set: {status: 'accepted'}},
                {new: true}
            );
            if (!action) return res.status(404).json({error: "Action not found or not pending"});

            // Apply the change to the target collection
            if (action.targetCollection === 'Task' && action.after) {
                await Task.findByIdAndUpdate(action.targetId, {$set: action.after});
            }
            res.json({success: true, action});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/ai-actions/:id/reject", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const action = await AIAction.findOneAndUpdate(
                {_id: req.params.id, userId: req.uid, status: 'pending_review'},
                {$set: {status: 'rejected'}},
                {new: true}
            );
            if (!action) return res.status(404).json({error: "Action not found or not pending"});
            res.json({success: true, action});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/ai-actions/:id/revert", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const action = await AIAction.findOne({
                _id: req.params.id,
                userId: req.uid,
                status: {$in: ['applied', 'accepted']}
            });
            if (!action) return res.status(404).json({error: "Action not found or not revertible"});

            if (action.before && action.targetCollection === 'Task') {
                await Task.findByIdAndUpdate(action.targetId, {$set: action.before});
            } else if (action.before && action.targetCollection === 'DailyPlan') {
                await DailyPlanModel.findByIdAndUpdate(action.targetId, {$set: action.before});
            }

            await AIAction.findByIdAndUpdate(action._id, {$set: {status: 'reverted'}});
            res.json({success: true, message: "Action reverted"});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Task Micro-Stepper ─────────────────────────────────────────────────
    app.post("/api/tasks/micro-steps", verifyToken, checkAIUsage, async (req: any, res: any) => {
        try {
            await connectDB();
            const {taskId} = req.body;
            if (!taskId) return res.status(400).json({error: "taskId required"});

            const task = await Task.findOne({_id: taskId, userId: req.uid});
            if (!task) return res.status(404).json({error: "Task not found"});

            const prompt = `You are a task initiation coach for someone with executive dysfunction.
Given this task: "${task.title}" — ${task.description || 'No description'}
Return a JSON array of 3-5 micro-steps that are physically concrete, sub-2-minute first actions.
Each must be so small they require no decision-making. E.g., "Open your laptop", "Open the document", "Write one sentence".
Do NOT include planning steps like "think about what to do".
Return JSON: [{"text": "...", "completed": false}]`;

            let microSteps: any[] = [];
            try {
                const response = await generateAIContent({
                    model: "gemini-3.5-flash",
                    contents: prompt,
                    config: {responseMimeType: 'application/json'}
                });
                const text = response.text || '';
                microSteps = JSON.parse(text);
            } catch {
                // Fallback generic micro-steps
                microSteps = [
                    {id: crypto.randomUUID(), title: "Take a deep breath", completed: false},
                    {id: crypto.randomUUID(), title: "Open the project files", completed: false},
                    {id: crypto.randomUUID(), title: "Do just the first small part", completed: false},
                ];
            }

            // Ensure IDs — map 'text' → 'title' to match SubtaskSchema
            microSteps = microSteps.map((s: any) => ({
                id: s.id || crypto.randomUUID(),
                title: s.text || s.title || 'Untitled step',
                completed: false
            }));

            await Task.findByIdAndUpdate(taskId, {$set: {microSteps}});

            // Log AI action
            await AIAction.create({
                userId: req.uid,
                type: 'micro_steps',
                targetId: taskId,
                targetCollection: 'Task',
                before: null,
                after: {microSteps},
                reason: `Generated ${microSteps.length} micro-steps to help overcome task paralysis`,
                status: 'applied'
            });

            res.json({microSteps});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Toggle micro-step completion
    app.put("/api/tasks/:id/micro-steps/:stepId", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {id: taskId, stepId} = req.params;
            const {completed} = req.body;
            if (typeof completed !== 'boolean') {
                return res.status(400).json({error: "completed (boolean) required"});
            }

            const task = await Task.findOne({_id: taskId, userId: req.uid});
            if (!task) return res.status(404).json({error: "Task not found"});

            const step = task.microSteps?.find((s: any) => s.id === stepId);
            if (!step) return res.status(404).json({error: "Micro-step not found"});

            step.completed = completed;
            task.markModified('microSteps');
            await task.save();

            res.json({microSteps: task.microSteps});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Dopamine Menu Routes ───────────────────────────────────────────────
    app.get("/api/dopamine-menu", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            let items = await DopamineMenuItemModel.find({userId: req.uid});
            if (items.length === 0) {
                // Seed defaults on first access
                const defaults = [
                    {userId: req.uid, label: 'Stretch', emoji: '🧘', durationMinutes: 3},
                    {userId: req.uid, label: 'Make tea', emoji: '🍵', durationMinutes: 5},
                    {userId: req.uid, label: '5 min walk', emoji: '🚶', durationMinutes: 5},
                    {userId: req.uid, label: 'Listen to favorite song', emoji: '🎵', durationMinutes: 3},
                    {userId: req.uid, label: 'Deep breathing', emoji: '🌬️', durationMinutes: 2},
                ];
                items = await DopamineMenuItemModel.insertMany(defaults);
            }
            // Return 3 random picks
            const shuffled = [...items].sort(() => 0.5 - Math.random());
            res.json({items: shuffled.slice(0, 3), allItems: items});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/dopamine-menu", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {label, emoji, durationMinutes} = req.body;
            if (!label) return res.status(400).json({error: "label required"});
            const item = await DopamineMenuItemModel.create({
                userId: req.uid,
                label,
                emoji: emoji || '✨',
                durationMinutes: durationMinutes ?? 5
            });
            res.json(item);
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.delete("/api/dopamine-menu/:id", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            await DopamineMenuItemModel.findOneAndDelete({_id: req.params.id, userId: req.uid});
            res.json({success: true});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Billing History ────────────────────────────────────────────────────
    app.get("/api/subscriptions/billing-history", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('subscriptions');
            if (!user) return res.status(404).json({error: "User not found"});

            const history = (user.subscriptions || []).map((sub: any) => ({
                plan: sub.plan,
                tier: sub.tier || 'pro',
                amount: sub.amount,
                currency: sub.currency,
                status: sub.status,
                startedAt: sub.startedAt,
                expiry: sub.expiry,
                paymentMethod: sub.paymentMethod
            })).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

            res.json({history});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/subscriptions/preview-change", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {newTier} = req.body;
            if (!newTier || !['pro', 'pro_plus'].includes(newTier)) {
                return res.status(400).json({error: "newTier must be 'pro' or 'pro_plus'"});
            }

            const user = await User.findById(req.uid).select('tier tierExpiry premiumExpiry subscriptionPlan subscriptions');
            if (!user) return res.status(404).json({error: "User not found"});

            const now = new Date();
            const expiry = user.tierExpiry || user.premiumExpiry;
            const daysRemaining = expiry ? Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

            const currentPrice = user.tier === 'pro_plus' ? 499 : user.tier === 'pro' ? 199 : 0;
            const newPrice = newTier === 'pro_plus' ? 499 : 199;
            const isUpgrade = newPrice > currentPrice;

            // Simple proration: credit remaining days of current plan toward new plan
            const dailyRate = currentPrice / 30;
            const credit = daysRemaining * dailyRate;
            const prorationAmount = Math.max(0, Math.round(newPrice - credit));

            res.json({
                currentTier: user.tier || (user.isPremium && user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'free'),
                newTier,
                daysRemaining,
                currentPrice,
                newPrice,
                credit: Math.round(credit),
                prorationAmount,
                isUpgrade
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Tier Resolution endpoint (for frontend) ────────────────────────────
    app.get("/api/user/tier", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const user = await User.findById(req.uid).select('tier tierExpiry isPremium premiumExpiry subscriptionPlan automationSettings');
            if (!user) return res.status(404).json({error: "User not found"});
            let effectiveTier = resolveTier(user);
            if (effectiveTier === 'free' && user.isPremium) {
                const isExpired = user.premiumExpiry && user.premiumExpiry < new Date();
                if (!isExpired) effectiveTier = user.subscriptionPlan ? tierFromPlan(user.subscriptionPlan) : 'pro_plus';
            }

            // Phase 2.4 — on-demand burnout check (cached for 24h per user)
            let burnoutSignal = null;
            const existingSignal = await BurnoutSignal.findOne({userId: req.uid, dismissed: false}).sort({date: -1});
            const todayStr = new Date().toISOString().split('T')[0];
            if (!existingSignal || existingSignal.date !== todayStr) {
                burnoutSignal = await computeBurnoutSignal(req.uid);
                if (burnoutSignal) {
                    await BurnoutSignal.findOneAndUpdate(
                        {userId: req.uid, date: todayStr},
                        {triggers: burnoutSignal.triggers, severity: burnoutSignal.severity, dismissed: false},
                        {upsert: true}
                    );
                }
            } else {
                burnoutSignal = {triggers: existingSignal.triggers, severity: existingSignal.severity};
            }

            res.json({
                tier: effectiveTier,
                tierExpiry: user.tierExpiry || user.premiumExpiry,
                subscriptionPlan: user.subscriptionPlan,
                automationSettings: {
                    global: user.automationSettings?.global || 'suggest',
                    perProject: user.automationSettings?.perProject || {}
                },
                burnoutSignal
            });
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Energy Logs (Phase 2) ──────────────────────────────────────────────
    app.post("/api/energy-logs", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {date, timeOfDay, energyLevel} = req.body;
            if (!date || !timeOfDay || energyLevel == null) {
                return res.status(400).json({error: "date, timeOfDay, and energyLevel are required"});
            }
            if (!['morning', 'afternoon', 'evening', 'night'].includes(timeOfDay)) {
                return res.status(400).json({error: "timeOfDay must be morning, afternoon, evening, or night"});
            }
            if (energyLevel < 1 || energyLevel > 5) {
                return res.status(400).json({error: "energyLevel must be 1-5"});
            }
            const log = await EnergyLog.findOneAndUpdate(
                {userId: req.uid, date, timeOfDay},
                {energyLevel, source: 'manual'},
                {upsert: true, new: true}
            );

            // Auto-infer burnout if energy is low (≤2) for two consecutive periods today
            const todayLogs = await EnergyLog.find({userId: req.uid, date}).sort({timeOfDay: 1});
            const lowPeriods = todayLogs.filter((l: any) => l.energyLevel <= 2);
            if (lowPeriods.length >= 2) {
                const triggers: string[] = [];
                if (lowPeriods.length >= 2) triggers.push('consecutive_low_energy');
                if (todayLogs.length >= 3) triggers.push('extended_low_energy');
                await BurnoutSignal.findOneAndUpdate(
                    {userId: req.uid, date},
                    {triggers, severity: triggers.length >= 2 ? 'high' : 'medium'},
                    {upsert: true}
                );
            }

            res.json({success: true, log});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.get("/api/energy-logs", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {date, range} = req.query;
            let query: any = {userId: req.uid};
            if (date) {
                query.date = date as string;
            } else if (range) {
                const days = parseInt(range as string) || 7;
                const since = new Date();
                since.setDate(since.getDate() - days);
                query.date = {$gte: since.toISOString().split('T')[0]};
            }
            const logs = await EnergyLog.find(query).sort({date: 1, timeOfDay: 1});
            res.json({logs});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Burnout Signals (Phase 2) ─────────────────────────────────────────
    app.get("/api/burnout-signals", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {range} = req.query;
            const days = parseInt(range as string) || 14;
            const since = new Date();
            since.setDate(since.getDate() - days);
            const signals = await BurnoutSignal.find({
                userId: req.uid,
                date: {$gte: since.toISOString().split('T')[0]}
            }).sort({date: -1});
            res.json({signals});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/burnout-signals/:id/dismiss", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const signal = await BurnoutSignal.findOneAndUpdate(
                {_id: req.params.id, userId: req.uid},
                {dismissed: true},
                {new: true}
            );
            if (!signal) return res.status(404).json({error: "Signal not found"});
            res.json({success: true, signal});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Knowledge Graph Search (Phase 3.2) ────────────────────────────────
    app.get("/api/knowledge/search", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {q} = req.query;
            if (!q || (q as string).trim().length < 1) {
                return res.status(400).json({error: "Search query (q) is required"});
            }
            const query = (q as string).trim();

            // Text search against name and aliases
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const entities = await KnowledgeEntity.find({
                userId: req.uid,
                $or: [
                    {name: {$regex: escapedQuery, $options: 'i'}},
                    {aliases: {$regex: escapedQuery, $options: 'i'}}
                ]
            }).limit(10);

            if (!entities.length) {
                return res.json({entities: [], edges: []});
            }

            const entityIds = entities.map((e: any) => e._id.toString());

            // Fetch connected edges (both directions)
            const edges = await KnowledgeEdge.find({
                userId: req.uid,
                $or: [
                    {fromEntityId: {$in: entityIds}},
                    {toEntityId: {$in: entityIds}}
                ]
            }).sort({extractedAt: -1}).limit(20);

            // Fetch referenced entities to resolve names
            const allReferencedIds = new Set<string>();
            edges.forEach((edge: any) => {
                allReferencedIds.add(edge.fromEntityId);
                allReferencedIds.add(edge.toEntityId);
            });
            const referencedEntities = await KnowledgeEntity.find({
                _id: {$in: Array.from(allReferencedIds)}
            });
            const entityMap = new Map<string, any>(referencedEntities.map((e: any) => [e._id.toString(), e]));

            // Enrich edges with entity names
            const enrichedEdges = edges.map((edge: any) => ({
                ...edge.toObject(),
                fromEntityName: entityMap.get(edge.fromEntityId)?.name || 'Unknown',
                toEntityName: entityMap.get(edge.toEntityId)?.name || 'Unknown'
            }));

            res.json({entities, edges: enrichedEdges});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    app.post("/api/knowledge/upsert", verifyToken, async (req: any, res: any) => {
        try {
            await connectDB();
            const {entities = [], edges = [], sourceType, sourceId} = req.body;
            const results = {entitiesUpserted: 0, edgesCreated: 0};

            for (const ent of entities) {
                if (!ent.type || !ent.name) continue;
                const existing = await KnowledgeEntity.findOne({
                    userId: req.uid, type: ent.type, name: ent.name
                });
                if (existing) {
                    if (ent.aliases?.length) {
                        await KnowledgeEntity.findByIdAndUpdate(existing._id, {
                            $addToSet: {aliases: {$each: ent.aliases}}
                        });
                    }
                } else {
                    await KnowledgeEntity.create({
                        userId: req.uid, type: ent.type, name: ent.name, aliases: ent.aliases || []
                    });
                    results.entitiesUpserted++;
                }
            }

            for (const edge of edges) {
                if (!edge.fromEntityId || !edge.toEntityId || !edge.relation) continue;
                const dup = await KnowledgeEdge.findOne({
                    userId: req.uid,
                    fromEntityId: edge.fromEntityId,
                    toEntityId: edge.toEntityId,
                    relation: edge.relation
                });
                if (!dup) {
                    await KnowledgeEdge.create({
                        userId: req.uid,
                        fromEntityId: edge.fromEntityId,
                        toEntityId: edge.toEntityId,
                        relation: edge.relation,
                        sourceType: sourceType || 'chat',
                        sourceId: sourceId || null
                    });
                    results.edgesCreated++;
                }
            }

            res.json({success: true, ...results});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Integrations — GitHub Webhook (Phase 3.5) ─────────────────────────
    const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
    app.post("/api/integrations/github/webhook", express.raw({type: 'application/json'}), async (req: any, res: any) => {
        try {
            // SECURITY: Verify GitHub webhook signature before processing any payload
            if (!GITHUB_WEBHOOK_SECRET) {
                console.error('GITHUB_WEBHOOK_SECRET is not configured — refusing to process GitHub webhook.');
                return res.status(500).json({error: 'Webhook not configured'});
            }
            const signature = req.headers['x-hub-signature-256'] as string;
            if (!signature) {
                return res.status(401).json({error: 'Missing signature header'});
            }
            const expectedSignature = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update((req as any).rawBody || req.body).digest('hex');
            const sigBuf = Buffer.from(signature);
            const expectedBuf = Buffer.from(expectedSignature);
            if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                return res.status(401).json({error: 'Invalid signature'});
            }

            const event = req.headers['x-github-event'] as string;
            const payload = JSON.parse(req.body.toString());

            if (!['issues', 'issue_comment'].includes(event)) {
                return res.json({received: true, skipped: true});
            }

            const installationId = payload.installation?.id;
            if (!installationId) return res.json({received: true});

            await connectDB();
            const conn = await IntegrationConnection.findOne({
                provider: 'github',
                externalAccountId: String(installationId)
            });
            if (!conn) return res.json({received: true, noConnection: true});

            const issue = payload.issue;
            if (!issue) return res.json({received: true});

            const action = payload.action;
            const url = issue.html_url;
            const title = issue.title;
            const body = issue.body || '';

            if (action === 'opened' || action === 'labeled') {
                const labelNames = (issue.labels || []).map((l: any) => l.name?.toLowerCase());
                const isHigh = labelNames.some((n: string) => ['urgent', 'high', 'p0', 'p1'].includes(n));
                const priority = isHigh ? 'high' : 'medium';

                const existing = await Task.findOne({
                    userId: conn.userId,
                    'externalRef.provider': 'github',
                    'externalRef.externalId': String(issue.id)
                });

                if (existing) {
                    existing.title = title;
                    existing.description = body.slice(0, 2000);
                    if (action === 'labeled') existing.priority = priority;
                    await existing.save();
                } else {
                    await Task.create({
                        userId: conn.userId,
                        title: `[GH] ${title}`,
                        description: body.slice(0, 2000),
                        priority,
                        category: 'GitHub',
                        externalRef: {provider: 'github', externalId: String(issue.id), url}
                    });
                }
            } else if (action === 'closed') {
                await Task.findOneAndUpdate(
                    {
                        userId: conn.userId,
                        'externalRef.provider': 'github',
                        'externalRef.externalId': String(issue.id)
                    },
                    {status: 'completed', completedAt: new Date().toISOString()}
                );
            }

            res.json({received: true});
        } catch (error: any) {
            console.error('GitHub webhook error:', error);
            res.status(500).json({error: safeError(error)});
        }
    });

    // ─── Low-Energy Replanning (Phase 2) ───────────────────────────────────
    app.post("/api/plans/:date/low-energy-replan", verifyToken, requireTier('pro_plus'), async (req: any, res: any) => {
        try {
            await connectDB();
            const {date} = req.params;
            const plan = await DailyPlanModel.findOne({userId: req.uid, date});
            if (!plan) return res.status(404).json({error: "No plan found for this date"});

            // Fetch today's energy logs
            const energyLogs = await EnergyLog.find({userId: req.uid, date});
            const avgEnergy = energyLogs.length > 0
                ? energyLogs.reduce((sum: number, l: any) => sum + l.energyLevel, 0) / energyLogs.length
                : 3;

            // Fetch open tasks
            const tasks = await Task.find({
                userId: req.uid,
                status: {$nin: ['completed', 'archived']}
            }).sort({priority: -1});
            if (!tasks.length) return res.status(200).json({success: true, plan, message: "No open tasks to replan"});

            const geminiApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
            let newPlan = plan;

            if (geminiApiKey && avgEnergy <= 2.5) {
                const prompt = `You are a productivity assistant replanning a user's day because their energy is low.
The user's average energy today is ${avgEnergy.toFixed(1)}/5.
Original plan sessions: ${JSON.stringify(plan.sessions?.map((s: any) => ({
                    taskTitle: s.taskTitle,
                    startTime: s.startTime,
                    endTime: s.endTime
                })) || [])}
Open tasks (by priority): ${tasks.slice(0, 8).map((t: any) => `${t.title} (priority ${t.priority})`).join(', ')}
Generate a lighter schedule with:
- Fewer, shorter focus blocks
- Longer breaks between blocks
- Move low-priority tasks to tomorrow
- Keep only 1-2 high-priority tasks
Return JSON: { "sessions": [{ "taskTitle": "...", "startTime": "HH:MM", "endTime": "HH:MM", "taskId": "..." }], "rationale": "..." }`;

                try {
                    const response = await generateAIContent({
                        model: "gemini-3.5-flash",
                        contents: prompt,
                        config: {responseMimeType: "application/json"}
                    });
                    const text = response.text || '';
                    const parsed = JSON.parse(text);
                    if (parsed.sessions && Array.isArray(parsed.sessions)) {
                        // Validate each session has required fields
                        const validSessions = parsed.sessions.filter((s: any) =>
                            s && typeof s.taskTitle === 'string' && typeof s.startTime === 'string' && typeof s.endTime === 'string'
                        );
                        if (validSessions.length > 0) {
                            plan.sessions = validSessions;
                            plan.replanRationale = parsed.rationale || 'Low energy replan';
                            await plan.save();
                            newPlan = plan;
                        }
                    }
                } catch (e: any) {
                    console.error('Low-energy replan AI error:', e.message);
                }
            }

            res.json({success: true, plan: newPlan, avgEnergy});
        } catch (error: any) {
            res.status(500).json({error: safeError(error)});
        }
    });

    // Config endpoint
    app.get("/api/config", (req, res) => {
        res.json({
            googleClientId: process.env.GOOGLE_CLIENT_ID,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            appUrl: process.env.FRONTEND_URL
        });
    });

    // Razorpay webhook endpoint - handles payment_link.paid events
    const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    app.post("/api/webhooks/razorpay", express.raw({type: 'application/json'}), async (req: any, res: any) => {
        try {
            // SECURITY: signature verification must be mandatory. If
            // RAZORPAY_WEBHOOK_SECRET is unset (previously the default, since it
            // wasn't even in .env.example), this endpoint would accept ANY POST
            // body as a genuine "payment captured" event and grant free premium
            // to whatever user/order it named — no payment required.
            if (!razorpayWebhookSecret) {
                console.error('RAZORPAY_WEBHOOK_SECRET is not configured — refusing to process webhook.');
                return res.status(500).json({error: 'Webhook not configured'});
            }
            const signature = req.headers['x-razorpay-signature'] as string;
            if (!signature) {
                return res.status(400).json({error: 'Missing signature'});
            }
            const expectedSignature = crypto.createHmac('sha256', razorpayWebhookSecret)
                .update((req as any).rawBody || req.body.toString())
                .digest('hex');
            let sigBuf: Buffer, expectedBuf: Buffer;
            try {
                sigBuf = Buffer.from(signature, 'hex');
                expectedBuf = Buffer.from(expectedSignature, 'hex');
            } catch {
                return res.status(400).json({error: 'Invalid signature'});
            }
            if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                return res.status(400).json({error: 'Invalid signature'});
            }

            const payload = JSON.parse(((req as any).rawBody || req.body).toString());
            const {event, payload: data, created_at} = payload;

            // Replay-attack guard: Razorpay recommends rejecting events whose
            // created_at is more than 5 minutes old.
            if (typeof created_at === 'number' && (Date.now() / 1000 - created_at) > 300) {
                console.warn('Razorpay webhook: stale event ignored', event, created_at);
                return res.json({received: true});
            }

            if (event === 'payment.captured' || event === 'payment_link.paid') {
                const paymentId = data.payment?.entity?.id;
                const orderId = data.order?.entity?.id;
                const paymentLinkId = data.payment_link?.entity?.id;
                const planFromNotes = data.payment?.entity?.notes?.plan || data.payment_link?.entity?.notes?.plan;

                if (!paymentId || data.payment?.entity?.status !== 'captured') {
                    return res.json({received: true});
                }

                await connectDB();

                // Find user by orderId or paymentLinkId
                let user = await User.findOne({
                    $or: [
                        {'subscriptions.orderId': orderId},
                        {'subscriptions.paymentLinkId': paymentLinkId},
                        {'subscriptions.paymentId': paymentId}
                    ]
                });

                // Also try userId from notes
                if (!user && data.payment?.entity?.notes?.userId) {
                    user = await User.findById(data.payment.entity.notes.userId);
                }

                // Also try by order notes (for orders created via create-order endpoint)
                if (!user && data.order?.entity?.notes?.userId) {
                    user = await User.findById(data.order.entity.notes.userId);
                }

                if (!user) {
                    console.log('Webhook: No user found for payment', paymentId, orderId, paymentLinkId);
                    return res.json({received: true});
                }

                // Use plan from notes or user record
                const plan = planFromNotes || user.subscriptionPlan || 'pro_monthly';
                const now = new Date();
                const expiryDate = new Date(now.getTime() + (plan.includes('annual') ? 365 : 30) * 24 * 60 * 60 * 1000);

                if (!user.subscriptions) user.subscriptions = [];
                const alreadyProcessed = user.subscriptions.some((s: any) => s.paymentId === paymentId);
                if (alreadyProcessed) {
                    return res.json({received: true, message: 'Payment already processed'});
                }

                const existingRecord = user.subscriptions.find(
                    (s: any) => s.orderId === orderId || s.paymentLinkId === paymentLinkId
                );

                if (existingRecord) {
                    // Update the existing 'created'/'pending' order record in place
                    // (created by /create-order or /payment-link) instead of pushing a
                    // duplicate, and guard against racing with a concurrent /verify call.
                    const updateResult = await User.findOneAndUpdate(
                        {
                            _id: user._id,
                            subscriptions: {$elemMatch: {orderId: existingRecord.orderId, status: {$ne: 'active'}}}
                        },
                        {
                            $set: {
                                isPremium: true,
                                premiumExpiry: expiryDate,
                                tier: tierFromPlan(plan),
                                tierExpiry: expiryDate,
                                subscriptionId: paymentId,
                                subscriptionPlan: plan,
                                subscriptionActive: true,
                                'subscriptions.$[elem].status': 'active',
                                'subscriptions.$[elem].paymentId': paymentId,
                                'subscriptions.$[elem].expiry': expiryDate,
                                'subscriptions.$[elem].paymentMethod': 'razorpay'
                            }
                        },
                        {arrayFilters: [{'elem.orderId': existingRecord.orderId}], new: true}
                    );
                    if (!updateResult) {
                        return res.json({received: true, message: 'Payment already processed'});
                    }
                } else {
                    // No matching order record (e.g. matched purely via notes.userId) —
                    // fall back to appending a new active record.
                    user.isPremium = true;
                    user.premiumExpiry = expiryDate;
                    user.tier = tierFromPlan(plan);
                    user.tierExpiry = expiryDate;
                    user.subscriptionActive = true;
                    user.subscriptionId = paymentId;
                    user.subscriptions.push({
                        plan,
                        amount: (await getEffectivePrice(plan)).price,
                        currency: 'INR',
                        orderId,
                        paymentId,
                        startedAt: now,
                        expiry: expiryDate,
                        status: 'active',
                        paymentMethod: 'razorpay'
                    });
                    await user.save();
                }

                console.log('Webhook activated premium for user:', user.email);

                res.json({received: true});
            } else {
                res.json({received: true});
            }
        } catch (error: any) {
            console.error("Razorpay webhook error:", error);
            res.status(500).json({error: safeError(error)});
        }
    });

    if (process.env.VERCEL !== '1') {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on http://0.0.0.0:${PORT}`);
        });
    }

    // Global error handler - catches async route handler errors
    // --- Vite Middleware ---
    if (process.env.NODE_ENV !== "production") {
        // Dynamic import: keeps 'vite' (and its rollup native binary dependency)
        // out of the production code path entirely. A static top-level import
        // would load vite/rollup on every environment, including production,
        // which crashed the Vercel serverless function with
        // "Cannot find module '@rollup/rollup-linux-x64-gnu'" since vite is
        // never actually needed once we're serving the prebuilt dist/ folder.
        const {createServer: createViteServer} = await import("vite");
        const vite = await createViteServer({
            server: {middlewareMode: true},
            appType: "spa",
        });
        app.use(vite.middlewares);

        app.get('*', async (req, res, next) => {
            // Do not intercept API, auth, or webhook routes that should be handled by subsequent routes
            if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/register')) {
                return next();
            }
            console.log(`[Dev SPA Fallback] Handling GET request for: ${req.originalUrl}`);
            try {
                const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
                const transformedHtml = await vite.transformIndexHtml(req.originalUrl, indexHtml);
                res.status(200).set({'Content-Type': 'text/html'}).end(transformedHtml);
            } catch (err: any) {
                console.error("[Dev SPA Fallback] Error rendering index.html:", err);
                res.status(500).send(`Dev SPA Fallback Error: ${err?.stack || err?.message || err}`);
            }
        });
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/register')) {
                return next();
            }
            // If express.static above didn't find the file, it's a real 404 —
            // not a client-side route to hand off to the SPA. This matters most
            // for hashed build assets (/assets/index-XXXX.css|js): after a
            // redeploy changes the hash, a browser holding a stale cached
            // index.html (or a stale service worker / CDN edge) will request
            // the old, now-nonexistent asset filename. Without this guard the
            // request fell through to sendFile(index.html) below, returning a
            // 200 text/html response for a .css/.js request — which browsers
            // correctly refuse to apply due to the MIME type mismatch. Bail out
            // to a plain 404 for anything under /assets or with a file
            // extension so those fail loudly (prompting a hard refresh)
            // instead of silently serving the wrong content type.
            if (req.path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(req.path)) {
                return res.status(404).end();
            }
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.use((err: any, req: any, res: any, next: any) => {
        console.error("Unhandled route error:", err);
        if (!res.headersSent) {
            res.status(500).json({error: safeError(err)});
        }
    });

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