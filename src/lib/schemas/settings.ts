import { z } from "zod";
import { LANGUAGE_IDS } from "@/lib/languages";
import { PROVIDERS } from "@/lib/providers";

export const languageSchema = z.object({
  language: z.enum(LANGUAGE_IDS, { error: "Pick a language" }),
});
export type LanguageInput = z.infer<typeof languageSchema>;

export const providerIdSchema = z.enum(PROVIDERS, { error: "Pick a provider" });

const apiKeyField = z.string().trim().min(8, "That doesn't look like an API key").max(400);
/** One of the user's saved keys; a typed `apiKey` wins over it. */
const keyIdField = z.string().regex(/^[a-f\d]{24}$/i, "Invalid key id");
/** The learner's own note on a key, saved with a newly typed one. */
const keyNoteField = z.string().trim().max(500, "Keep the note under 500 characters");

/** Neither a key nor a key id means "use the key already stored for this provider". */
export const modelsQuerySchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
  keyId: keyIdField.optional(),
});

export const testConnectionSchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
  keyId: keyIdField.optional(),
  model: z.string().min(1, "Pick a model").max(200),
});

export const keyDetailsSchema = z.object({
  label: z.string().trim().max(40, "Keep the name under 40 characters"),
  note: keyNoteField,
});

export const visionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("same") }),
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("custom"),
    provider: providerIdSchema,
    model: z.string().min(1, "Pick a vision model").max(200),
    apiKey: apiKeyField.optional(),
    keyId: keyIdField.optional(),
    keyNote: keyNoteField.optional(),
  }),
]);
export type VisionInput = z.infer<typeof visionSchema>;

export const providerSettingsSchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
  keyId: keyIdField.optional(),
  keyNote: keyNoteField.optional(),
  model: z.string().min(1, "Pick a model").max(200),
  vision: visionSchema,
  /** Web search on the user's own Tavily key. An omitted key keeps the stored one. */
  search: z.object({
    enabled: z.boolean(),
    apiKey: apiKeyField.optional(),
    keyId: keyIdField.optional(),
    keyNote: keyNoteField.optional(),
  }),
});
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

/**
 * Client form shape: empty strings instead of undefined, refined on submit. Each key slot holds either
 * a typed key or a saved key's id (`keyId`); an empty id means "enter a new key". The vision slot can
 * also be `"main"`: reuse the main model's key, when both use the same provider.
 */
export const providerFormSchema = z
  .object({
    provider: providerIdSchema,
    apiKey: z.string().trim().max(400),
    keyId: z.string(),
    keyNote: keyNoteField,
    model: z.string().min(1, "Pick a model"),
    visionMode: z.enum(["same", "none", "custom"]),
    visionProvider: providerIdSchema,
    visionApiKey: z.string().trim().max(400),
    visionKeyId: z.string(),
    visionKeyNote: keyNoteField,
    visionModel: z.string(),
    searchEnabled: z.boolean(),
    searchApiKey: z.string().trim().max(400),
    searchKeyId: z.string(),
    searchKeyNote: keyNoteField,
  })
  .superRefine((v, ctx) => {
    if (!v.apiKey && !v.keyId) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Connect OpenRouter or enter your API key" });
    } else if (v.apiKey && v.apiKey.length < 8) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "That doesn't look like an API key" });
    }
    if (v.visionMode === "custom") {
      if (!v.visionModel) ctx.addIssue({ code: "custom", path: ["visionModel"], message: "Pick a vision model" });
      const reusesMain = v.visionKeyId === "main" && v.visionProvider === v.provider;
      if (!v.visionApiKey && (!v.visionKeyId || (v.visionKeyId === "main" && !reusesMain))) {
        ctx.addIssue({ code: "custom", path: ["visionApiKey"], message: "Enter a key for this provider" });
      } else if (v.visionApiKey && v.visionApiKey.length < 8) {
        ctx.addIssue({ code: "custom", path: ["visionApiKey"], message: "That doesn't look like an API key" });
      }
    }
    if (v.searchEnabled && !v.searchApiKey && !v.searchKeyId) {
      ctx.addIssue({ code: "custom", path: ["searchApiKey"], message: "Enter your Tavily API key, or turn web search off" });
    } else if (v.searchApiKey && v.searchApiKey.length < 8) {
      ctx.addIssue({ code: "custom", path: ["searchApiKey"], message: "That doesn't look like a Tavily API key" });
    }
  });
export type ProviderFormValues = z.infer<typeof providerFormSchema>;
