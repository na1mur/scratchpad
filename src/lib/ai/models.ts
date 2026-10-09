import "server-only";
import { ApiError } from "@/lib/api";
import { OPENAI_COMPATIBLE_BASE_URLS } from "@/lib/ai/compatible";
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
  google: [
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro", supportsImages: true },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash", supportsImages: true },
  ],
  xai: [
    { id: "grok-4", label: "grok-4", supportsImages: false },
    { id: "grok-3", label: "grok-3", supportsImages: false },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "mistral-large-latest", supportsImages: false },
    { id: "mistral-small-latest", label: "mistral-small-latest", supportsImages: false },
    { id: "pixtral-large-latest", label: "pixtral-large-latest", supportsImages: true },
  ],
  deepseek: [
    { id: "deepseek-v4-pro", label: "deepseek-v4-pro", supportsImages: false },
    { id: "deepseek-v4-flash", label: "deepseek-v4-flash", supportsImages: false },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile", supportsImages: false },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "llama-4-scout-17b-16e-instruct", supportsImages: true },
  ],
  cerebras: [
    { id: "gpt-oss-120b", label: "gpt-oss-120b", supportsImages: false },
    { id: "gemma-4-31b", label: "gemma-4-31b", supportsImages: true },
  ],
  togetherai: [
    { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Instruct Turbo", supportsImages: null },
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", supportsImages: null },
  ],
  fireworks: [
    { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", label: "llama-v3p3-70b-instruct", supportsImages: null },
    { id: "accounts/fireworks/models/deepseek-v3", label: "deepseek-v3", supportsImages: null },
  ],
  deepinfra: [
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct", supportsImages: null },
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", supportsImages: null },
  ],
  cohere: [
    { id: "command-a-03-2025", label: "command-a-03-2025", supportsImages: false },
    { id: "command-r-plus-08-2024", label: "command-r-plus-08-2024", supportsImages: false },
  ],
  // Perplexity has no model-listing endpoint, so this list is always what's shown.
  perplexity: [
    { id: "sonar-pro", label: "sonar-pro", supportsImages: true },
    { id: "sonar", label: "sonar", supportsImages: true },
    { id: "sonar-reasoning-pro", label: "sonar-reasoning-pro", supportsImages: true },
  ],
  baseten: [{ id: "openai/gpt-oss-120b", label: "gpt-oss-120b", supportsImages: false }],
  gateway: [
    { id: "anthropic/claude-sonnet-5.5", label: "Anthropic: Claude Sonnet 5.5", supportsImages: true },
    { id: "openai/gpt-5", label: "OpenAI: GPT-5", supportsImages: true },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-5.5", label: "Anthropic: Claude Sonnet 5.5", supportsImages: true },
    { id: "openai/gpt-5", label: "OpenAI: GPT-5", supportsImages: true },
  ],
  // The providers below are reached through their OpenAI-compatible APIs. These
  // lists only appear when the live listing is unavailable, so they stay short.
  moonshotai: [
    { id: "kimi-k2.6", label: "kimi-k2.6", supportsImages: null },
    { id: "kimi-k2.5", label: "kimi-k2.5", supportsImages: null },
  ],
  // Z.AI may not expose a listing endpoint, in which case this list is what's shown.
  zai: [
    { id: "glm-5.2", label: "glm-5.2", supportsImages: false },
    { id: "glm-5.1", label: "glm-5.1", supportsImages: false },
  ],
  alibaba: [
    { id: "qwen3-max", label: "qwen3-max", supportsImages: false },
    { id: "qwen-plus", label: "qwen-plus", supportsImages: false },
  ],
  minimax: [{ id: "MiniMax-M2", label: "MiniMax-M2", supportsImages: false }],
  nvidia: [{ id: "meta/llama-3.3-70b-instruct", label: "llama-3.3-70b-instruct", supportsImages: false }],
  sambanova: [
    { id: "gpt-oss-120b", label: "gpt-oss-120b", supportsImages: false },
    { id: "Meta-Llama-3.3-70B-Instruct", label: "Meta-Llama-3.3-70B-Instruct", supportsImages: false },
  ],
  nebius: [{ id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct", supportsImages: null }],
  huggingface: [{ id: "openai/gpt-oss-120b", label: "gpt-oss-120b", supportsImages: false }],
};

const TIMEOUT_MS = 10_000;

class InvalidKey extends Error {}

async function getJson(
  url: string,
  headers: Record<string, string>,
  invalidStatuses: number[] = [401, 403],
): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (invalidStatuses.includes(res.status)) throw new InvalidKey();
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

// Listings without capability metadata are screened by name for non-chat models.
// Image support stays null when a provider doesn't say; it's never guessed.
const NON_CHAT = /(embed|rerank|moderation|whisper|transcrib|tts|speech|audio|realtime|image|imagen|video|veo|flux|stable-diffusion|ocr)/i;

/** OpenAI-style `{ data: [{ id }] }` listing, shared by most providers below. */
async function listOpenAIStyle<M extends { id: string }>(
  url: string,
  apiKey: string,
  toOption: (m: M) => ModelOption | null,
): Promise<ModelOption[]> {
  const data = (await getJson(url, { Authorization: `Bearer ${apiKey}` })) as { data: M[] };
  return data.data.flatMap((m) => toOption(m) ?? []);
}

const chatOnly = (supportsImages: boolean | null) => (m: { id: string }) =>
  NON_CHAT.test(m.id) ? null : { id: m.id, label: m.id, supportsImages };

async function listGoogle(apiKey: string): Promise<ModelOption[]> {
  // Google answers a bad key with 400 API_KEY_INVALID rather than 401.
  const data = (await getJson(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    { "x-goog-api-key": apiKey },
    [400, 401, 403],
  )) as { models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && !NON_CHAT.test(m.name))
    .map((m) => {
      const id = m.name.replace(/^models\//, "");
      return { id, label: m.displayName ?? id, supportsImages: id.startsWith("gemini") ? true : null };
    });
}

const listXai = (apiKey: string) =>
  listOpenAIStyle("https://api.x.ai/v1/models", apiKey, (m: { id: string }) => {
    if (NON_CHAT.test(m.id)) return null;
    // grok-4.5 and newer read images; grok-3 and grok-4 don't.
    const [, major, minor] = /^grok-(\d+)(?:\.(\d+))?/.exec(m.id) ?? [];
    const sees = Number(major) > 4 || (Number(major) === 4 && Number(minor ?? 0) >= 5) || m.id.includes("vision");
    return { id: m.id, label: m.id, supportsImages: major ? sees : null };
  });

async function listMistral(apiKey: string): Promise<ModelOption[]> {
  const data = (await getJson("https://api.mistral.ai/v1/models", { Authorization: `Bearer ${apiKey}` })) as {
    data: { id: string; capabilities?: { completion_chat?: boolean; vision?: boolean } }[];
  };
  return data.data
    .filter((m) => m.capabilities?.completion_chat !== false && !NON_CHAT.test(m.id))
    .map((m) => ({ id: m.id, label: m.id, supportsImages: m.capabilities?.vision ?? null }));
}

async function listTogether(apiKey: string): Promise<ModelOption[]> {
  type Item = { id: string; type?: string; display_name?: string };
  const raw = (await getJson("https://api.together.xyz/v1/models", { Authorization: `Bearer ${apiKey}` })) as
    | Item[]
    | { data: Item[] };
  const list = Array.isArray(raw) ? raw : raw.data;
  return list
    .filter((m) => m.type === "chat")
    .map((m) => ({
      id: m.id,
      label: m.display_name ?? m.id,
      supportsImages: /(vl|vision)/i.test(m.id) ? true : null,
    }));
}

async function listCohere(apiKey: string): Promise<ModelOption[]> {
  const data = (await getJson("https://api.cohere.com/v1/models?endpoint=chat&page_size=100", {
    Authorization: `Bearer ${apiKey}`,
  })) as { models: { name: string }[] };
  return data.models.map((m) => ({ id: m.name, label: m.name, supportsImages: m.name.includes("vision") ? true : null }));
}

const listFireworks = (apiKey: string) =>
  listOpenAIStyle("https://api.fireworks.ai/inference/v1/models", apiKey, (m: {
    id: string;
    supports_chat?: boolean;
    supports_image_input?: boolean;
  }) =>
    m.supports_chat === false || NON_CHAT.test(m.id)
      ? null
      : {
          id: m.id,
          label: m.id.replace(/^accounts\/fireworks\/models\//, ""),
          supportsImages: m.supports_image_input ?? null,
        },
  );

const listDeepInfra = (apiKey: string) =>
  listOpenAIStyle("https://api.deepinfra.com/v1/openai/models", apiKey, (m: {
    id: string;
    metadata?: { tags?: string[] } | null;
  }) =>
    NON_CHAT.test(m.id)
      ? null
      : { id: m.id, label: m.id, supportsImages: m.metadata?.tags ? m.metadata.tags.includes("vision") : null },
  );

const listGroq = (apiKey: string) =>
  listOpenAIStyle("https://api.groq.com/openai/v1/models", apiKey, (m: { id: string; active?: boolean }) =>
    m.active === false || NON_CHAT.test(m.id) || /(guard|orpheus|playai)/i.test(m.id)
      ? null
      : { id: m.id, label: m.id, supportsImages: /(llama-4|vision)/.test(m.id) ? true : null },
  );

async function listGateway(apiKey: string): Promise<ModelOption[]> {
  const data = (await getJson("https://ai-gateway.vercel.sh/v1/models", { Authorization: `Bearer ${apiKey}` })) as {
    data: { id: string; name?: string; type?: string; tags?: string[] }[];
  };
  return data.data
    .filter((m) => !m.type || m.type === "language")
    .map((m) => ({
      id: m.id,
      label: m.name ?? m.id,
      supportsImages: m.tags ? m.tags.includes("vision") || m.tags.includes("file-input") : null,
    }));
}

/**
 * `GET <base>/models` for the OpenAI-compatible providers. Capability metadata
 * differs by provider, so image support is only reported when the entry says so.
 */
function listCompatible(provider: keyof typeof OPENAI_COMPATIBLE_BASE_URLS) {
  return (apiKey: string) =>
    listOpenAIStyle(
      `${OPENAI_COMPATIBLE_BASE_URLS[provider]}/models`,
      apiKey,
      (m: { id: string; supports_image_in?: boolean; architecture?: { input_modalities?: string[] } }) => {
        if (NON_CHAT.test(m.id)) return null;
        const modalities = m.architecture?.input_modalities;
        const supportsImages = m.supports_image_in ?? (modalities ? modalities.includes("image") : null);
        return { id: m.id, label: m.id, supportsImages };
      },
    );
}

const LISTERS: Record<ProviderId, (apiKey: string) => Promise<ModelOption[]>> = {
  openai: listOpenAI,
  anthropic: listAnthropic,
  google: listGoogle,
  xai: listXai,
  mistral: listMistral,
  deepseek: (k) => listOpenAIStyle("https://api.deepseek.com/models", k, chatOnly(false)),
  groq: listGroq,
  cerebras: (k) => listOpenAIStyle("https://api.cerebras.ai/v1/models", k, chatOnly(null)),
  togetherai: listTogether,
  fireworks: listFireworks,
  deepinfra: listDeepInfra,
  cohere: listCohere,
  // No listing endpoint exists, so the key can't be checked here; "Test connection" does that.
  perplexity: async () => [],
  baseten: (k) => listOpenAIStyle("https://inference.baseten.co/v1/models", k, chatOnly(null)),
  gateway: listGateway,
  openrouter: listOpenRouter,
  moonshotai: listCompatible("moonshotai"),
  zai: listCompatible("zai"),
  alibaba: listCompatible("alibaba"),
  minimax: listCompatible("minimax"),
  nvidia: listCompatible("nvidia"),
  sambanova: listCompatible("sambanova"),
  nebius: listCompatible("nebius"),
  huggingface: listCompatible("huggingface"),
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
