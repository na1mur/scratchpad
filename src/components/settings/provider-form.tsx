"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon, LogInIcon, PlugZapIcon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ModelPicker, type ModelOption } from "@/components/settings/model-picker";
import { ProviderPicker } from "@/components/settings/provider-picker";
import { ReturnCountdown } from "@/components/settings/return-countdown";
import { api } from "@/lib/fetcher";
import { finishOpenRouterConnect, startOpenRouterConnect, takeReturnTo } from "@/lib/openrouter-connect";
import type { ProviderId } from "@/lib/providers";
import { providerFormSchema, type ProviderFormValues, type ProviderSettingsInput } from "@/lib/schemas/settings";
import type { PublicUser } from "@/lib/serializers";

type Listing = { models: ModelOption[]; source: "live" | "fallback" };
type LoadState = { status: "idle" | "loading" | "ready" | "error"; listing?: Listing; error?: string };
type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };
// Buttons on the mint OpenRouter card. Three shades so each reads as its own control in light and dark:
// a solid fill for the main action, a paper tint for the refresh icon, an ink tint for the escape hatch.
const CARD_PRIMARY = "bg-brand-strong text-background hover:bg-brand-strong/85";
const CARD_PAPER = "bg-background/70 text-foreground hover:bg-background";
const CARD_INK = "bg-foreground/10 text-foreground hover:bg-foreground/15";

type ConnectState = { status: "idle" | "redirecting" | "connecting" | "connected" | "error"; error?: string };

// Only prefixes that are known to be stable; the rest just get a generic prompt.
const KEY_HINTS: Record<ProviderId, string> = {
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
};

/** Placeholder for a saved key: its prefix when the hint has one, then the last 4. */
function savedKeyHint(provider: ProviderId, last4: string) {
  const hint = KEY_HINTS[provider];
  return `${hint.includes("…") ? hint.replace("…", "") : ""}…${last4} (saved)`;
}

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

export function ProviderForm({
  ai,
  onboarding,
  returnTo,
}: {
  ai: PublicUser["ai"];
  onboarding?: boolean;
  /** Where to send the learner after saving (a failed run sent them here to change model). */
  returnTo?: string | null;
}) {
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
  const [redirecting, setRedirecting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [returning, setReturning] = useState(false);
  const [connect, setConnect] = useState<ConnectState>({ status: "idle" });
  const connectStarted = useRef(false);
  // Reveals the provider and key fields even while OpenRouter is the active provider.
  const [manual, setManual] = useState(false);
  const busy =
    form.formState.isSubmitting ||
    redirecting ||
    skipping ||
    connect.status === "redirecting" ||
    connect.status === "connecting";

  const canUseStoredMain = ai?.provider === v.provider;
  // OpenRouter with a key in hand (just connected, or already saved): nothing to type, so hide the key fields.
  const viaOpenRouter = !manual && v.provider === "openrouter" && (connect.status === "connected" || canUseStoredMain);
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
      // Never blank the selected model here: the saved one may be missing from a
      // fallback or differently-named listing. Provider changes reset it themselves.
      return { status: "ready", listing };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : "Couldn't load models." };
    }
  }

  async function loadModels(target: "main" | "vision") {
    const set = target === "main" ? setMain : setVision;
    set({ status: "loading" });
    const result = await requestModels(target);
    if (result?.status === "error") toast.error(result.error);
    set(result ?? { status: "idle" });
  }

  /** Leaves the OpenRouter sign-in: shows the provider and key fields, minus the key OpenRouter issued. */
  function useOwnKey() {
    setManual(true);
    setConnect({ status: "idle" });
    setTest({ status: "idle" });
    // Otherwise the OpenRouter key would be sent to whichever provider is picked next.
    form.setValue("apiKey", "");
  }

  async function connectOpenRouter() {
    setConnect({ status: "redirecting" });
    try {
      await startOpenRouterConnect(returnTo);
    } catch (err) {
      setConnect({ status: "error", error: err instanceof Error ? err.message : "Couldn't start OpenRouter sign-in." });
    }
  }

  /** Back from OpenRouter with `?code=`: swap it for the key and fill the form with it. */
  async function completeOpenRouterConnect(code: string) {
    // OpenRouter drops the query string, so the way back was parked in this tab and is restored here.
    const back = takeReturnTo();
    router.replace(back ? `${window.location.pathname}?returnTo=${encodeURIComponent(back)}` : window.location.pathname, {
      scroll: false,
    });
    setConnect({ status: "connecting" });
    try {
      const key = await finishOpenRouterConnect(code);
      if (form.getValues("provider") !== "openrouter") form.setValue("model", "");
      form.setValue("provider", "openrouter");
      form.setValue("apiKey", key, { shouldValidate: true });
      setTest({ status: "idle" });
      setManual(false);
      setConnect({ status: "connected" });
      await loadModels("main");
    } catch (err) {
      setConnect({ status: "error", error: err instanceof Error ? err.message : "Couldn't connect OpenRouter." });
      if (ai) void loadModels("main");
      else setMain({ status: "idle" });
    }
  }

  // Settings page: the key is already stored, so list models straight away.
  // Initial state is already "loading" in that case.
  useEffect(() => {
    // The ref keeps Strict Mode's second effect run from spending the code twice.
    const code = new URLSearchParams(window.location.search).get("code");
    if (code && !connectStarted.current) {
      connectStarted.current = true;
      void completeOpenRouterConnect(code);
    } else if (ai && !code) {
      void requestModels("main").then((r) => setMain(r ?? { status: "idle" }));
    }
    if (ai && initialVisionCustom) void requestModels("vision").then((r) => setVision(r ?? { status: "idle" }));
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
      const message = `Connected in ${(latencyMs / 1000).toFixed(1)}s`;
      setTest({ status: "ok", message });
      toast.success(`Connection works. ${message}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed.";
      setTest({ status: "error", message });
      toast.error(message);
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
        setRedirecting(true);
        toast.success("You're all set! Add your first problem.");
        router.push(redirectTo);
      } else {
        toast.success("AI provider saved");
        form.reset(defaults(user.ai));
        if (returnTo) setReturning(true);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings.");
    }
  }

  async function skip() {
    setSkipping(true);
    try {
      const { redirectTo } = await api<{ redirectTo: string }>("/api/settings/provider/skip", { method: "POST" });
      setRedirecting(true);
      toast.success("Skipped for now. Connect your AI any time in Settings.");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't skip this step.");
    } finally {
      setSkipping(false);
    }
  }

  const mainModels = main.listing?.models ?? [];
  const keyPlaceholder =
    canUseStoredMain && ai ? savedKeyHint(v.provider ?? "openai", ai.keyLast4) : KEY_HINTS[v.provider ?? "openai"];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
      <fieldset disabled={busy} className="contents">
      <FieldGroup>
        <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand-soft p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {viaOpenRouter && <CheckCircle2Icon className="size-4 shrink-0 text-viz-success" />}
                {viaOpenRouter ? "OpenRouter connected" : "Sign in with OpenRouter"}
              </p>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {viaOpenRouter
                  ? connect.status === "connected"
                    ? "Pick a model below, then save. There's no key to enter."
                    : "Using the key you connected. Reconnect to replace it."
                  : "No key to copy. One OpenRouter account covers hundreds of models, including free ones, and you can revoke Scratchpad's key any time in your OpenRouter settings."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {viaOpenRouter && (
                <Button
                  type="button"
                  size="icon"
                  className={CARD_PAPER}
                  aria-label="Reload models"
                  disabled={main.status === "loading"}
                  onClick={() => loadModels("main")}
                >
                  {main.status === "loading" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                </Button>
              )}
              <LoadingButton
                type="button"
                className={CARD_PRIMARY}
                onClick={connectOpenRouter}
                loading={connect.status === "redirecting" || connect.status === "connecting"}
                disabled={busy}
                icon={<LogInIcon />}
              >
                {connect.status === "connecting" ? "Connecting…" : viaOpenRouter ? "Reconnect" : "Connect OpenRouter"}
              </LoadingButton>
            </div>
          </div>
          {viaOpenRouter && main.status === "error" && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircleIcon className="size-4 shrink-0" /> {main.error}
            </p>
          )}
          {connect.status === "error" && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircleIcon className="size-4 shrink-0" /> {connect.error}
            </p>
          )}
          {viaOpenRouter && (
            <Button type="button" className={cn("w-fit", CARD_INK)} onClick={useOwnKey}>
              <KeyRoundIcon /> Use my own API key instead
            </Button>
          )}
        </div>

        {!viaOpenRouter && (
          <>
            {/* Not FieldSeparator: its label sits on bg-background, which shows on the settings card. */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span aria-hidden className="h-px flex-1 bg-border" />
              or use an API key from any provider
              <span aria-hidden className="h-px flex-1 bg-border" />
            </div>

            <Controller
              name="provider"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="provider">Provider</FieldLabel>
                  <ProviderPicker
                    id="provider"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // A key typed for the previous provider is wrong for this one.
                      form.setValue("apiKey", "");
                      form.setValue("model", "");
                      setTest({ status: "idle" });
                      void loadModels("main");
                    }}
                  />
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
          </>
        )}

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
          <LoadingButton
            type="button"
            variant="secondary"
            onClick={testConnection}
            loading={test.status === "testing"}
            disabled={!v.model || busy}
            icon={<PlugZapIcon />}
          >
            {test.status === "testing" ? "Testing…" : "Test connection"}
          </LoadingButton>
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
                  <ProviderPicker
                    id="visionProvider"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      form.setValue("visionModel", "");
                      void loadModels("vision");
                    }}
                  />
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

      </fieldset>
      {returning && returnTo && <ReturnCountdown returnTo={returnTo} onStay={() => setReturning(false)} />}
      <div className="flex items-center justify-end gap-2">
        {onboarding && (
          <LoadingButton type="button" variant="ghost" onClick={skip} loading={skipping} disabled={busy}>
            {skipping ? "Skipping…" : "Skip for now"}
          </LoadingButton>
        )}
        <LoadingButton type="submit" loading={form.formState.isSubmitting || redirecting}>
          {form.formState.isSubmitting || redirecting ? "Saving…" : onboarding ? "Finish setup" : "Save provider"}
        </LoadingButton>
      </div>
    </form>
  );
}
