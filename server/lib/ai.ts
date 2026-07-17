import {GoogleGenAI} from "@google/genai";
import OpenAI from "openai";
import {OpenRouter} from "@openrouter/sdk";

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

    const res = result as { choices?: { message?: { content?: any } }[] };
    const raw = res.choices?.[0]?.message?.content ?? '';
    const content = Array.isArray(raw)
        ? raw.map((item: any) => item?.text || '').join('')
        : typeof raw === 'string' ? raw
            : String(raw);
    if (!content && res.choices?.length) {
        console.warn(`[AI] Empty content from OpenRouter model ${params.model}.`);
    }
    return content;
}

// Unified content generation — routes to Gemini SDK or OpenAI-compatible provider.
// When the primary provider fails with a quota error, falls back to the next available
// configured provider so the user isn't stuck on a single exhausted API key.
export async function generateAIContent(params: {
    model: string;
    contents: any;
    config?: any;
}): Promise<{ text: string }> {
    const model = params.model;

    // ── Gemini path ──
    if (isGeminiModel(model)) {
        try {
            const response = await generateContentWithRetry(params);
            return {text: response.text || ''};
        } catch (err: any) {
            const isQuota = err.status === 429 || err.isQuotaExceeded ||
                (err.message && (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')));
            if (!isQuota) throw err;
            console.warn(`[AI] Gemini quota exhausted — attempting cross-provider fallback...`);
        }
    }

    // ── Cross-provider fallback (or primary path for non-Gemini models) ──
    // Try every configured non-Gemini provider in order until one works.
    const fallbackProviders = AI_PROVIDERS.filter(p => !p.name.includes('Gemini'));
    const triedProviders = new Set<string>();

    // If the requested model is already non-Gemini, try it first
    if (!isGeminiModel(model)) {
        const primaryProvider = getProviderForModel(model);
        if (primaryProvider) {
            triedProviders.add(primaryProvider.name);
            const apiKey = getApiKeyForProvider(primaryProvider);
            if (apiKey) {
                try {
                    const text = await callOpenAICompat(primaryProvider, apiKey, model, params);
                    return {text};
                } catch (err: any) {
                    const isQuota = err.statusCode === 429 ||
                        (err.message && (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota')));
                    if (!isQuota) throw err;
                    console.warn(`[AI] ${primaryProvider.name} quota exhausted for ${model}, trying fallback providers...`);
                }
            }
        }
    }

    // Try remaining providers with their first available model
    for (const provider of fallbackProviders) {
        if (triedProviders.has(provider.name)) continue;
        const apiKey = getApiKeyForProvider(provider);
        if (!apiKey) continue;
        const fallbackModel = provider.models[0]?.id;
        if (!fallbackModel) continue;
        try {
            console.log(`[AI] Falling back to ${provider.name} (${fallbackModel})...`);
            const text = await callOpenAICompat(provider, apiKey, fallbackModel, params);
            return {text};
        } catch (err: any) {
            console.warn(`[AI] ${provider.name} also failed: ${err.message}`);
            continue;
        }
    }

    throw new Error("All AI providers are currently unavailable or rate-limited. Please try again later or switch the AI Brain model in Mission Control.");
}

// Helper: call an OpenAI-compatible provider with retry
async function callOpenAICompat(
    provider: AIProvider, apiKey: string, model: string,
    params: { contents: any; config?: any }
): Promise<string> {
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
        messages = [{role: 'user', content: params.contents.parts.map((p: any) => p.text || '').join('\n')}];
    } else {
        messages = [{role: 'user', content: JSON.stringify(params.contents)}];
    }

    let responseFormat: { type: string } | undefined;
    if (params.config?.responseMimeType === 'application/json') {
        responseFormat = {type: 'json_object'};
    }

    const maxRetries = 2;
    let delay = 1000;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (provider.name === 'OpenRouter') {
                return await openrouterChat({
                    apiKey, model, messages,
                    temperature: params.config?.temperature ?? 0.7,
                    topP: params.config?.topP,
                    maxTokens: params.config?.maxOutputTokens ?? 8192,
                    responseFormat,
                });
            }
            return await openaiCompatChat({
                baseUrl: provider.baseUrl, apiKey, model, messages,
                temperature: params.config?.temperature ?? 0.7,
                topP: params.config?.topP,
                maxTokens: params.config?.maxOutputTokens ?? 8192,
                responseFormat,
            });
        } catch (err: any) {
            lastError = err;
            const isQuota = err.statusCode === 429 ||
                (err.message && (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota') || err.message.includes('limit')));
            if (isQuota && attempt < maxRetries) {
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
export function getValidModel(modelName: string | undefined): string {
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
            const ai = new GoogleGenAI({
                apiKey: process.env.GEMINI_API_KEY,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build',
                    }
                }
            });

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