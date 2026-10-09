import type { ProviderId } from "@/lib/providers";

/**
 * Providers reached through the generic OpenAI-compatible client rather than an
 * SDK package of their own. Only the international endpoints are listed: keys
 * from the China-region platforms (Moonshot, Alibaba, MiniMax, Z.AI) are
 * region-locked and don't work against these.
 */
export const OPENAI_COMPATIBLE_BASE_URLS = {
  moonshotai: "https://api.moonshot.ai/v1",
  zai: "https://api.z.ai/api/paas/v4",
  alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  minimax: "https://api.minimax.io/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  sambanova: "https://api.sambanova.ai/v1",
  nebius: "https://api.tokenfactory.nebius.com/v1",
  huggingface: "https://router.huggingface.co/v1",
} as const satisfies Partial<Record<ProviderId, string>>;
