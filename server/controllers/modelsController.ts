import {Request, Response} from "express";
import {GoogleGenAI} from "@google/genai";

const AI_PROVIDERS = [
    {
        name: "Google Gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        models: [
            {id: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash"},
            {id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite"},
            {id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)"},
        ],
    },
    {
        name: "Groq",
        apiKeyEnv: "GROQ_API_KEY",
        models: [
            {id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B (Groq)"},
            {id: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B (Groq)"},
            {id: "llama-4-scout-17b-16e-instruct", displayName: "Llama 4 Scout 17B (Groq)"},
            {id: "llama-4-maverick-17b-128e-instruct", displayName: "Llama 4 Maverick 17B (Groq)"},
            {id: "mixtral-8x7b-32768", displayName: "Mixtral 8x7B (Groq)"},
            {id: "gemma2-9b-it", displayName: "Gemma 2 9B (Groq)"},
            {id: "deepseek-r1-distill-llama-70b", displayName: "DeepSeek R1 70B (Groq)"},
        ],
    },
    {
        name: "NVIDIA NIM",
        apiKeyEnv: "NIM_API_KEY",
        models: [
            {id: "deepseek-ai/deepseek-v4-pro", displayName: "DeepSeek V4 Pro (NIM)"},
            {id: "minimaxai/minimax-m3", displayName: "MiniMax M3 (NIM)"},
            {id: "nvidia/nemotron-3-ultra-550b-a55b", displayName: "Nemotron Ultra 550B (NIM)"},
            {id: "stepfun-ai/step-3.7-flash", displayName: "Step 3.7 Flash (NIM)"},
            {id: "mistralai/mistral-medium-3.5-128b", displayName: "Mistral Medium 3.5 (NIM)"},
        ],
    },
    {
        name: "OpenRouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
        models: [
            {id: "tencent/hy3:free", displayName: "Tencent Hy3 (OpenRouter Free)"},
            {id: "poolside/laguna-xs-2.1:free", displayName: "Poolside Laguna XS 2.1 (OpenRouter Free)"},
            {id: "cohere/north-mini-code:free", displayName: "Cohere North Mini Code (OpenRouter Free)"},
            {
                id: "nvidia/nemotron-3.5-content-safety:free",
                displayName: "Nemotron 3.5 Content Safety (OpenRouter Free)"
            },
            {id: "nvidia/nemotron-3-ultra-550b-a55b:free", displayName: "Nemotron 3 Ultra (OpenRouter Free)"},
            {
                id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
                displayName: "Nemotron 3 Nano Omni (OpenRouter Free)"
            },
            {id: "poolside/laguna-m.1:free", displayName: "Poolside Laguna M.1 (OpenRouter Free)"},
            {id: "google/gemma-4-26b-a4b-it:free", displayName: "Gemma 4 26B A4B (OpenRouter Free)"},
            {id: "google/gemma-4-31b-it:free", displayName: "Gemma 4 31B (OpenRouter Free)"},
        ],
    },
    {
        name: "Together AI",
        apiKeyEnv: "TOGETHER_API_KEY",
        models: [
            {id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", displayName: "Llama 3.3 70B Turbo (Together)"},
            {id: "deepseek-ai/DeepSeek-V3", displayName: "DeepSeek V3 (Together)"},
            {id: "Qwen/Qwen3-235B-A22B-Instruct-2507", displayName: "Qwen 3 235B (Together)"},
            {id: "mistralai/Mistral-Small-3.1-24B-Instruct-2503", displayName: "Mistral Small 3.1 (Together)"},
        ],
    },
    {
        name: "DeepSeek",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        models: [
            {id: "deepseek-chat", displayName: "DeepSeek Chat (V3)"},
            {id: "deepseek-reasoner", displayName: "DeepSeek Reasoner (R1)"},
        ],
    },
    {
        name: "Mistral AI",
        apiKeyEnv: "MISTRAL_API_KEY",
        models: [
            {id: "mistral-large-latest", displayName: "Mistral Large (Mistral)"},
            {id: "mistral-medium-latest", displayName: "Mistral Medium (Mistral)"},
            {id: "mistral-nemo", displayName: "Mistral Nemo (Mistral)"},
            {id: "open-mixtral-8x7b", displayName: "Mixtral 8x7B (Mistral)"},
        ],
    },
    {
        name: "Cerebras",
        apiKeyEnv: "CEREBRAS_API_KEY",
        models: [
            {id: "llama-3.3-70b", displayName: "Llama 3.3 70B (Cerebras)"},
            {id: "llama-3.1-8b", displayName: "Llama 3.1 8B (Cerebras)"},
            {id: "qwen-2.5-32b", displayName: "Qwen 2.5 32B (Cerebras)"},
        ],
    },
    {
        name: "Fireworks AI",
        apiKeyEnv: "FIREWORKS_API_KEY",
        models: [
            {id: "accounts/fireworks/models/deepseek-v3", displayName: "DeepSeek V3 (Fireworks)"},
            {id: "accounts/fireworks/models/llama-v3p3-70b-instruct", displayName: "Llama 3.3 70B (Fireworks)"},
            {id: "accounts/fireworks/models/qwen3-235b", displayName: "Qwen 3 235B (Fireworks)"},
        ],
    },
];

function getApiKeyForProvider(provider: { apiKeyEnv: string }): string | undefined {
    return process.env[provider.apiKeyEnv];
}

export const listModels = async (req: any, res: Response) => {
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

        try {
            const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
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
                    displayName: m.displayName || m.name?.split("/").pop() || m.name || "",
                    provider: "Google Gemini",
                    available: !!process.env.GEMINI_API_KEY,
                }))
                .filter((m: any) => {
                    const name = (m.name || "").toLowerCase();
                    return (
                        name.includes("gemini") &&
                        !name.includes("embed") &&
                        !name.includes("gemini-2.0-flash") &&
                        !name.includes("gemini-1.5") &&
                        !name.includes("gemini-pro")
                    );
                });

            if (geminiModels.length > 0) {
                const curatedIds = new Set(geminiModels.map((m: any) => m.name));
                const filtered = allModels.filter(
                    (m) => !(m.provider === "Google Gemini" && curatedIds.has(m.name))
                );
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
        const fallback = AI_PROVIDERS.flatMap((p) =>
            p.models.map((m) => ({
                name: m.id,
                displayName: m.displayName,
                provider: p.name,
                available: !!getApiKeyForProvider(p),
            }))
        );
        res.json(fallback);
    }
};
