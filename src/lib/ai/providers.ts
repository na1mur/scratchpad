import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { ApiError } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import type { ProviderId } from "@/lib/providers";
import type { UserDoc } from "@/models/User";

export function createModel(provider: ProviderId, apiKey: string, model: string): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openrouter":
      return createOpenRouter({ apiKey, appName: "Scratchpad" })(model);
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
