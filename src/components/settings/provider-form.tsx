"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon, PlugZapIcon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModelPicker, type ModelOption } from "@/components/settings/model-picker";
import { api } from "@/lib/fetcher";
import { PROVIDERS, PROVIDER_LABELS, type ProviderId } from "@/lib/providers";
import { providerFormSchema, type ProviderFormValues, type ProviderSettingsInput } from "@/lib/schemas/settings";
import type { PublicUser } from "@/lib/serializers";

type Listing = { models: ModelOption[]; source: "live" | "fallback" };
type LoadState = { status: "idle" | "loading" | "ready" | "error"; listing?: Listing; error?: string };
type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

const providerItems = PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }));

const KEY_HINTS: Record<ProviderId, string> = {
  openai: "sk-…",
  anthropic: "sk-ant-…",
  openrouter: "sk-or-…",
};

function defaults(ai: PublicUser["ai"]): ProviderFormValues {
  const vision = ai?.vision;
  const visionIsSame = vision && vision.provider === ai?.provider && vision.model === ai?.model && !vision.hasOwnKey;
  return {
    provider: ai?.provider ?? "openai",
    apiKey: "",
    model: ai?.model ?? "",
    visionMode: !ai ? "same" : !vision ? "none" : visionIsSame ? "same" : "custom",
    visionProvider: vision?.provider ?? ai?.provider ?? "openai",
    visionApiKey: "",
    visionModel: vision && !visionIsSame ? vision.model : "",
    hasStoredKey: Boolean(ai),
    hasStoredVisionKey: Boolean(vision?.hasOwnKey),
    storedProvider: ai?.provider ?? null,
    storedVisionProvider: vision?.hasOwnKey ? vision.provider : null,
  };
}

export function ProviderForm({ ai, onboarding }: { ai: PublicUser["ai"]; onboarding?: boolean }) {
  const router = useRouter();
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: defaults(ai),
  });
  const v = useWatch({ control: form.control });
  const initialVisionCustom = Boolean(ai?.vision) && defaults(ai).visionMode === "custom";
  const [main, setMain] = useState<LoadState>({ status: ai ? "loading" : "idle" });
  const [vision, setVision] = useState<LoadState>({ status: initialVisionCustom ? "loading" : "idle" });
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const canUseStoredMain = ai?.provider === v.provider;
  const canUseStoredVision =
    v.visionProvider === v.provider || (ai?.vision?.hasOwnKey && ai.vision.provider === v.visionProvider);
  const selectedModel = main.listing?.models.find((m) => m.id === v.model);
  const modelSupportsImages = selectedModel?.supportsImages !== false;

  /** Fetches a model listing; returns null when there's no usable key yet. */
  async function requestModels(target: "main" | "vision"): Promise<LoadState | null> {
    const values = form.getValues();
    const provider = target === "main" ? values.provider : values.visionProvider;
    let apiKey = (target === "main" ? values.apiKey : values.visionApiKey) || undefined;
    // A vision model on the main provider can borrow the main key from the form.
    if (target === "vision" && !apiKey && provider === values.provider) apiKey = values.apiKey || undefined;
    const storedUsable =
      target === "main"
        ? ai?.provider === provider
        : provider === values.provider
          ? ai?.provider === provider
          : ai?.vision?.hasOwnKey && ai.vision.provider === provider;
    if (!apiKey && !storedUsable) return null;
    try {
      const listing = await api<Listing>("/api/settings/models", { method: "POST", body: { provider, apiKey } });
      const field = target === "main" ? "model" : "visionModel";
      const current = form.getValues(field);
      if (current && !listing.models.some((m) => m.id === current)) form.setValue(field, "");
      return { status: "ready", listing };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : "Couldn't load models." };
    }
  }

  async function loadModels(target: "main" | "vision") {
    const set = target === "main" ? setMain : setVision;
    set({ status: "loading" });
    set((await requestModels(target)) ?? { status: "idle" });
  }

  // Settings page: the key is already stored, so list models straight away.
  // Initial state is already "loading" in that case.
  useEffect(() => {
    if (!ai) return;
    void requestModels("main").then((r) => setMain(r ?? { status: "idle" }));
    if (initialVisionCustom) void requestModels("vision").then((r) => setVision(r ?? { status: "idle" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testConnection() {
    const values = form.getValues();
    if (!values.model) {
      form.setError("model", { message: "Pick a model to test" });
      return;
    }
    setTest({ status: "testing" });
    try {
      const { latencyMs } = await api<{ latencyMs: number }>("/api/settings/provider/test", {
        method: "POST",
        body: { provider: values.provider, apiKey: values.apiKey || undefined, model: values.model },
      });
      setTest({ status: "ok", message: `Connected in ${(latencyMs / 1000).toFixed(1)}s` });
    } catch (err) {
      setTest({ status: "error", message: err instanceof Error ? err.message : "Connection failed." });
    }
  }

  async function onSubmit(values: ProviderFormValues) {
    const payload: ProviderSettingsInput = {
      provider: values.provider,
      apiKey: values.apiKey || undefined,
      model: values.model,
      vision:
        values.visionMode === "custom"
          ? {
              mode: "custom",
              provider: values.visionProvider,
              model: values.visionModel,
              apiKey: values.visionApiKey || undefined,
            }
          : { mode: values.visionMode },
    };
    try {
      const { redirectTo, user } = await api<{ redirectTo: string; user: PublicUser }>("/api/settings/provider", {
        method: "PUT",
        body: payload,
      });
      if (onboarding) {
        router.push(redirectTo);
      } else {
        toast.success("AI provider saved");
        form.reset(defaults(user.ai));
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings.");
    }
  }

  const mainModels = main.listing?.models ?? [];
  const keyPlaceholder =
    canUseStoredMain && ai ? `${KEY_HINTS[v.provider ?? "openai"].replace("…", "")}…${ai.keyLast4} (saved)` : KEY_HINTS[v.provider ?? "openai"];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
      <FieldGroup>
        <Controller
          name="provider"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="provider">Provider</FieldLabel>
              <Select
                items={providerItems}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue("model", "");
                  setTest({ status: "idle" });
                  void loadModels("main");
                }}
              >
                <SelectTrigger id="provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerItems.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          name="apiKey"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="apiKey">API key</FieldLabel>
              <div className="flex gap-2">
                <Input
                  {...field}
                  id="apiKey"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={keyPlaceholder}
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    field.onChange(e);
                    setTest({ status: "idle" });
                  }}
                  onBlur={() => {
                    field.onBlur();
                    if (field.value) void loadModels("main");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Load models"
                  disabled={main.status === "loading" || (!v.apiKey && !canUseStoredMain)}
                  onClick={() => loadModels("main")}
                >
                  {main.status === "loading" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                </Button>
              </div>
              <FieldDescription>
                {canUseStoredMain && ai
                  ? "Leave blank to keep your saved key. Entering a new one replaces it."
                  : "Encrypted at rest and only decrypted on the server when making AI calls."}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
              {main.status === "error" && <FieldError>{main.error}</FieldError>}
            </Field>
          )}
        />

        <Controller
          name="model"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="model">Model</FieldLabel>
              <ModelPicker
                id="model"
                models={mainModels}
                value={field.value}
                invalid={fieldState.invalid}
                disabled={main.status !== "ready"}
                placeholder={main.status === "loading" ? "Loading models…" : "Enter your key to load models"}
                onChange={(id) => {
                  field.onChange(id);
                  setTest({ status: "idle" });
                  const m = mainModels.find((x) => x.id === id);
                  if (m?.supportsImages === false && form.getValues("visionMode") === "same") {
                    form.setValue("visionMode", "none");
                  }
                }}
              />
              {main.listing?.source === "fallback" && (
                <FieldDescription>
                  Couldn&apos;t fetch the live model list, so this is a short built-in list.
                </FieldDescription>
              )}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={testConnection}
            disabled={test.status === "testing" || !v.model}
          >
            {test.status === "testing" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
            Test connection
          </Button>
          {test.status === "ok" && (
            <span className="flex items-center gap-1.5 text-sm text-viz-success">
              <CheckCircle2Icon className="size-4" /> {test.message}
            </span>
          )}
          {test.status === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircleIcon className="size-4" /> {test.message}
            </span>
          )}
        </div>
      </FieldGroup>

      <FieldSet>
        <FieldLegend>Vision model for notebook images</FieldLegend>
        <FieldDescription>Optional. Used to transcribe photos of handwritten pseudo-code.</FieldDescription>
        <Controller
          name="visionMode"
          control={form.control}
          render={({ field }) => (
            <div role="radiogroup" aria-label="Vision model" className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { id: "same", label: "Same as above", disabled: !modelSupportsImages },
                  { id: "custom", label: "Different model" },
                  { id: "none", label: "None" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={field.value === opt.id}
                  disabled={"disabled" in opt && opt.disabled}
                  onClick={() => {
                    field.onChange(opt.id);
                    if (opt.id === "custom" && vision.status === "idle") void loadModels("vision");
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                    field.value === opt.id && "border-primary bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        />
        {!modelSupportsImages && (
          <FieldDescription>The selected model can&apos;t read images, so pick a different one or skip this.</FieldDescription>
        )}

        {v.visionMode === "custom" && (
          <FieldGroup className="rounded-lg border p-4">
            <Controller
              name="visionProvider"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="visionProvider">Provider</FieldLabel>
                  <Select
                    items={providerItems}
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue("visionModel", "");
                      void loadModels("vision");
                    }}
                  >
                    <SelectTrigger id="visionProvider" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerItems.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              name="visionApiKey"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="visionApiKey">API key</FieldLabel>
                  <Input
                    {...field}
                    id="visionApiKey"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={canUseStoredVision ? "Leave blank to reuse the saved key" : KEY_HINTS[v.visionProvider ?? "openai"]}
                    aria-invalid={fieldState.invalid}
                    onBlur={() => {
                      field.onBlur();
                      if (field.value) void loadModels("vision");
                    }}
                  />
                  <FieldError errors={[fieldState.error]} />
                  {vision.status === "error" && <FieldError>{vision.error}</FieldError>}
                </Field>
              )}
            />
            <Controller
              name="visionModel"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="visionModel">Vision model</FieldLabel>
                  <ModelPicker
                    id="visionModel"
                    models={(vision.listing?.models ?? []).filter((m) => m.supportsImages !== false)}
                    value={field.value}
                    invalid={fieldState.invalid}
                    disabled={vision.status !== "ready"}
                    placeholder={vision.status === "loading" ? "Loading models…" : "Enter a key to load models"}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        )}
      </FieldSet>

      <Button type="submit" className="self-end" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
        {onboarding ? "Finish setup" : "Save provider"}
      </Button>
    </form>
  );
}
