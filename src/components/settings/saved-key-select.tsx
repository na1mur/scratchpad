"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KeyUse, SavedKeyRow } from "@/lib/providerKeys";
import type { KeyProviderId } from "@/lib/providers";
import type { PublicUser } from "@/lib/serializers";

// Only prefixes that are known to be stable; the rest just get a generic prompt.
export const KEY_HINTS: Record<KeyProviderId, string> = {
  openai: "sk-…",
  anthropic: "sk-ant-…",
  google: "AIza…",
  xai: "xai-…",
  mistral: "API key",
  deepseek: "sk-…",
  groq: "gsk_…",
  cerebras: "csk-…",
  togetherai: "API key",
  fireworks: "fw_…",
  deepinfra: "API key",
  cohere: "API key",
  perplexity: "pplx-…",
  baseten: "API key",
  gateway: "API key",
  openrouter: "sk-or-…",
  moonshotai: "sk-…",
  zai: "API key",
  alibaba: "sk-…",
  minimax: "API key",
  nvidia: "nvapi-…",
  sambanova: "API key",
  nebius: "API key",
  huggingface: "hf_…",
  tavily: "tvly-…",
};

/** A saved key as the learner sees it: the provider's prefix when it has one, then the last 4. */
export function maskedKey(provider: KeyProviderId, last4: string) {
  const hint = KEY_HINTS[provider];
  return `${hint.includes("…") ? hint.replace("…", "") : ""}…${last4}`;
}

/** The form's value for "type a new key" instead of picking a saved one. */
export const NEW_KEY = "";
const NEW_KEY_ITEM = "new";

export type KeyChoice = { value: string; label: string };

/** "sk-…a1F3 · Work · rejected" */
export function keyLabel(key: SavedKeyRow) {
  return [maskedKey(key.provider, key.keyLast4), key.label, key.rejected && "rejected"].filter(Boolean).join(" · ");
}

// The saved-keys card and the provider form live apart (the form is on onboarding too), so the card
// tells the form about a deleted key, or a key to activate, through window events.

/** A saved key was deleted. `user` is the settings afterwards; `cleared` lists what lost its key. */
export const KEY_DELETED_EVENT = "scratchpad:saved-key-deleted";
export type KeyDeletedDetail = { keyId: string; cleared: KeyUse[]; user: PublicUser };

/** Fill the form with this saved key to activate it, or with an empty key field when `key` is null. */
export const USE_KEY_EVENT = "scratchpad:use-saved-key";
export type UseKeyDetail = { key: SavedKeyRow | null };

/**
 * Picks one of the learner's saved keys for a provider, or "Enter a new key", for which the form shows
 * its key input. `extra` adds choices above the saved keys, such as reusing the main model's key.
 */
export function SavedKeySelect({
  id,
  keys,
  value,
  onChange,
  extra = [],
  invalid,
}: {
  id: string;
  keys: SavedKeyRow[];
  /** A saved key id, an `extra` value, or NEW_KEY. */
  value: string;
  onChange: (value: string) => void;
  extra?: KeyChoice[];
  invalid?: boolean;
}) {
  const items = [
    ...extra,
    ...keys.map((k) => ({ value: k.id, label: keyLabel(k) })),
    { value: NEW_KEY_ITEM, label: "Enter a new key" },
  ];
  return (
    <Select
      items={items}
      value={value === NEW_KEY ? NEW_KEY_ITEM : value}
      onValueChange={(v) => v && onChange(v === NEW_KEY_ITEM ? NEW_KEY : v)}
    >
      <SelectTrigger id={id} className="w-full min-w-0" aria-invalid={invalid}>
        <SelectValue placeholder="Pick a key" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
