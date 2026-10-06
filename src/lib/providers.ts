// Shared between client and server: just the provider identities, no SDKs.
export const PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};
