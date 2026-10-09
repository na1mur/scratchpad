import { z } from "zod";
import { LANGUAGE_IDS } from "@/lib/languages";
import { PROVIDERS } from "@/lib/providers";

export const languageSchema = z.object({
  language: z.enum(LANGUAGE_IDS, { error: "Pick a language" }),
});
export type LanguageInput = z.infer<typeof languageSchema>;

export const providerIdSchema = z.enum(PROVIDERS, { error: "Pick a provider" });

const apiKeyField = z.string().trim().min(8, "That doesn't look like an API key").max(400);

/** An omitted key means "use the key already stored for this provider". */
export const modelsQuerySchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
});

export const testConnectionSchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
  model: z.string().min(1, "Pick a model").max(200),
});

export const visionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("same") }),
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("custom"),
    provider: providerIdSchema,
    model: z.string().min(1, "Pick a vision model").max(200),
    apiKey: apiKeyField.optional(),
  }),
]);
export type VisionInput = z.infer<typeof visionSchema>;

export const providerSettingsSchema = z.object({
  provider: providerIdSchema,
  apiKey: apiKeyField.optional(),
  model: z.string().min(1, "Pick a model").max(200),
  vision: visionSchema,
  /** Web search on the user's own Tavily key. An omitted key keeps the stored one. */
  search: z.object({
    enabled: z.boolean(),
    apiKey: apiKeyField.optional(),
  }),
});
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

/** Client form shape: empty strings instead of undefined, refined on submit. */
export const providerFormSchema = z
  .object({
    provider: providerIdSchema,
    apiKey: z.string().trim().max(400),
    model: z.string().min(1, "Pick a model"),
    visionMode: z.enum(["same", "none", "custom"]),
    visionProvider: providerIdSchema,
    visionApiKey: z.string().trim().max(400),
    visionModel: z.string(),
    hasStoredKey: z.boolean(),
    hasStoredVisionKey: z.boolean(),
    storedProvider: providerIdSchema.nullable(),
    storedVisionProvider: providerIdSchema.nullable(),
    searchEnabled: z.boolean(),
    searchApiKey: z.string().trim().max(400),
    hasStoredSearchKey: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const canReuseMainKey = v.hasStoredKey && v.storedProvider === v.provider;
    if (!v.apiKey && !canReuseMainKey) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Connect OpenRouter or enter your API key" });
    } else if (v.apiKey && v.apiKey.length < 8) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "That doesn't look like an API key" });
    }
    if (v.visionMode === "custom") {
      if (!v.visionModel) ctx.addIssue({ code: "custom", path: ["visionModel"], message: "Pick a vision model" });
      const reusesMain = v.visionProvider === v.provider;
      const reusesStoredVision = v.hasStoredVisionKey && v.storedVisionProvider === v.visionProvider;
      if (!v.visionApiKey && !reusesMain && !reusesStoredVision) {
        ctx.addIssue({ code: "custom", path: ["visionApiKey"], message: "Enter a key for this provider" });
      }
    }
    if (v.searchEnabled && !v.searchApiKey && !v.hasStoredSearchKey) {
      ctx.addIssue({ code: "custom", path: ["searchApiKey"], message: "Enter your Tavily API key, or turn web search off" });
    } else if (v.searchApiKey && v.searchApiKey.length < 8) {
      ctx.addIssue({ code: "custom", path: ["searchApiKey"], message: "That doesn't look like a Tavily API key" });
    }
  });
export type ProviderFormValues = z.infer<typeof providerFormSchema>;
