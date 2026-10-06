import "server-only";
import { ApiError } from "@/lib/api";
import type { ProviderId } from "@/lib/providers";

export type ModelOption = {
  id: string;
  label: string;
  /** null when the provider's listing doesn't say. */
  supportsImages: boolean | null;
};

export type ModelListing = { models: ModelOption[]; source: "live" | "fallback" };

// Used only when a provider's list endpoint is down. Keep it short; these go
// stale, which is exactly why live listing is the primary path.
const FALLBACK: Record<ProviderId, ModelOption[]> = {
  openai: [
    { id: "gpt-5", label: "gpt-5", supportsImages: true },
    { id: "gpt-5-mini", label: "gpt-5-mini", supportsImages: true },
    { id: "gpt-4.1", label: "gpt-4.1", supportsImages: true },
  ],
  anthropic: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", supportsImages: true },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", supportsImages: true },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", supportsImages: true },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-5.5", label: "Anthropic: Claude Sonnet 5.5", supportsImages: true },
    { id: "openai/gpt-5", label: "OpenAI: GPT-5", supportsImages: true },
  ],
};

const TIMEOUT_MS = 10_000;

class InvalidKey extends Error {}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new InvalidKey();
  if (!res.ok) throw new Error(`list models failed: ${res.status}`);
  return res.json();
}

// OpenAI's listing has no capability metadata and includes embeddings,
// audio, image and moderation models. Keep the chat-capable families.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_EXCLUDE = /(audio|realtime|transcribe|tts|embedding|image|search|moderation|instruct|codex)/;
const OPENAI_NO_VISION = /^(gpt-3\.5|o1-mini|o3-mini)/;

async function listOpenAI(apiKey: string): Promise<ModelOption[]> {
  const data = (await getJson("https://api.openai.com/v1/models", {
    Authorization: `Bearer ${apiKey}`,
  })) as { data: { id: string; created: number }[] };
  return data.data
    .filter((m) => OPENAI_CHAT.test(m.id) && !OPENAI_EXCLUDE.test(m.id))
    .sort((a, b) => b.created - a.created)
    .map((m) => ({ id: m.id, label: m.id, supportsImages: !OPENAI_NO_VISION.test(m.id) }));
}

async function listAnthropic(apiKey: string): Promise<ModelOption[]> {
  const data = (await getJson("https://api.anthropic.com/v1/models?limit=100", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  })) as { data: { id: string; display_name?: string }[] };
  return data.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id, supportsImages: true }));
}

async function listOpenRouter(apiKey: string): Promise<ModelOption[]> {
  // The model catalogue is public, so validate the key separately.
  await getJson("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${apiKey}` });
  const data = (await getJson("https://openrouter.ai/api/v1/models", {
    Authorization: `Bearer ${apiKey}`,
  })) as {
    data: { id: string; name?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }[];
  };
  return data.data
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
    .map((m) => ({
      id: m.id,
      label: m.name ?? m.id,
      supportsImages: m.architecture?.input_modalities ? m.architecture.input_modalities.includes("image") : null,
    }));
}

const LISTERS: Record<ProviderId, (apiKey: string) => Promise<ModelOption[]>> = {
  openai: listOpenAI,
  anthropic: listAnthropic,
  openrouter: listOpenRouter,
};

/** Lists models with the user's key; this doubles as key validation. */
export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelListing> {
  try {
    const models = await LISTERS[provider](apiKey);
    if (models.length === 0) return { models: FALLBACK[provider], source: "fallback" };
    return { models, source: "live" };
  } catch (err) {
    if (err instanceof InvalidKey) {
      throw new ApiError(400, "invalid_key", "The provider rejected this API key.");
    }
    return { models: FALLBACK[provider], source: "fallback" };
  }
}
