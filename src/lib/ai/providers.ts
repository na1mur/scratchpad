import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createBaseten } from "@ai-sdk/baseten";
import { createCerebras } from "@ai-sdk/cerebras";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, type LanguageModel } from "ai";
import { ApiError } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { OPENAI_COMPATIBLE_BASE_URLS } from "@/lib/ai/compatible";
import type { ProviderId } from "@/lib/providers";
import type { UserDoc } from "@/models/User";

export function createModel(provider: ProviderId, apiKey: string, model: string): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "xai":
      return createXai({ apiKey })(model);
    case "mistral":
      return createMistral({ apiKey })(model);
    case "deepseek":
      return createDeepSeek({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "cerebras":
      return createCerebras({ apiKey })(model);
    case "togetherai":
      return createTogetherAI({ apiKey })(model);
    case "fireworks":
      return createFireworks({ apiKey })(model);
    case "deepinfra":
      return createDeepInfra({ apiKey })(model);
    case "cohere":
      return createCohere({ apiKey })(model);
    case "perplexity":
      return createPerplexity({ apiKey })(model);
    case "baseten":
      return createBaseten({ apiKey })(model);
    case "gateway":
      return createGateway({ apiKey })(model);
    case "openrouter":
      return createOpenRouter({ apiKey, appName: "Scratchpad" })(model);
    default:
      // Providers with no SDK package of their own, reached through their OpenAI-compatible API.
      // Structured output is on because the pipelines depend on the schema reaching the model.
      return createOpenAICompatible({
        name: provider,
        apiKey,
        baseURL: OPENAI_COMPATIBLE_BASE_URLS[provider],
        supportsStructuredOutputs: true,
        includeUsage: true,
      })(model);
  }
}

export type ResolvedModel = {
  model: LanguageModel;
  provider: ProviderId;
  modelId: string;
};

/**
 * Decrypts the stored key only at the moment a model is needed. The key
 * lives in this closure and is never returned, logged or put in errors.
 */
export function getModel(user: Pick<UserDoc, "ai">, purpose: "reasoning" | "vision"): ResolvedModel {
  const ai = user.ai;
  if (!ai) throw new ApiError(400, "no_provider", "Set up an AI provider in Settings first.");

  if (purpose === "vision") {
    const vision = ai.vision;
    if (!vision) {
      throw new ApiError(400, "no_vision_model", "Pick a vision model in Settings to read notebook images.");
    }
    const key = vision.apiKey ? decrypt(vision.apiKey) : decrypt(ai.apiKey);
    return { model: createModel(vision.provider, key, vision.model), provider: vision.provider, modelId: vision.model };
  }

  return { model: createModel(ai.provider, decrypt(ai.apiKey), ai.model), provider: ai.provider, modelId: ai.model };
}
