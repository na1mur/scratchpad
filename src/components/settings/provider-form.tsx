"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2Icon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, LogInIcon, PlugZapIcon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker, type ModelOption } from "@/components/settings/model-picker";
import { ProviderPicker } from "@/components/settings/provider-picker";
import { ReturnCountdown } from "@/components/settings/return-countdown";
import {
  KEY_DELETED_EVENT,
  KEY_HINTS,
  NEW_KEY,
  SavedKeySelect,
  USE_KEY_EVENT,
  type KeyDeletedDetail,
  type UseKeyDetail,
} from "@/components/settings/saved-key-select";
import { ApiClientError, api } from "@/lib/fetcher";
import { finishOpenRouterConnect, startOpenRouterConnect, takeReturnTo } from "@/lib/openrouter-connect";
import type { SavedKeyRow } from "@/lib/providerKeys";
import { PROVIDER_LABELS, type KeyProviderId, type ProviderId } from "@/lib/providers";
import { providerFormSchema, type ProviderFormValues, type ProviderSettingsInput } from "@/lib/schemas/settings";
import type { PublicUser } from "@/lib/serializers";
import type { SearchUsage } from "@/lib/tavily";

type Listing = { models: ModelOption[]; source: "live" | "fallback" };
type LoadState = { status: "idle" | "loading" | "ready" | "error"; listing?: Listing; error?: string };
type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };
// Buttons on the mint OpenRouter card. Three shades so each reads as its own control in light and dark:
// a solid fill for the main action, a paper tint for the refresh icon, an ink tint for the escape hatch.
const CARD_PRIMARY = "bg-brand-strong text-background hover:bg-brand-strong/85";
const CARD_PAPER = "bg-background/70 text-foreground hover:bg-background";
const CARD_INK = "bg-foreground/10 text-foreground hover:bg-foreground/15";

type ConnectState = { status: "idle" | "redirecting" | "connecting" | "connected" | "error"; error?: string };

/** Optional note saved with a newly typed key, to remember what it's for. */
function KeyNoteField({
  control,
  name,
}: {
  control: Control<ProviderFormValues>;
  name: "keyNote" | "visionKeyNote" | "searchKeyNote";
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>Note (optional)</FieldLabel>
          <Textarea
            {...field}
            id={name}
            rows={2}
            maxLength={500}
            placeholder="What it's for, its credit balance, anything you want to remember"
            aria-invalid={fieldState.invalid}
          />
          <FieldDescription>Only you can see it. Edit it any time under Saved API keys.</FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** The learner's most recently used saved key for a provider, or NEW_KEY when there's none. */
function latestKey(savedKeys: SavedKeyRow[], provider: KeyProviderId) {
  return savedKeys.find((k) => k.provider === provider)?.id ?? NEW_KEY;
}

function defaults(ai: PublicUser["ai"], search: PublicUser["search"], savedKeys: SavedKeyRow[]): ProviderFormValues {
  const vision = ai?.vision;
  const visionIsSame = vision && vision.provider === ai?.provider && vision.model === ai?.model && !vision.hasOwnKey;
  return {
    provider: ai?.provider ?? "openai",
    apiKey: "",
    keyNote: "",
    keyId: ai ? (ai.keyId ?? NEW_KEY) : latestKey(savedKeys, "openai"),
    model: ai?.model ?? "",
    visionMode: !ai ? "same" : !vision ? "none" : visionIsSame ? "same" : "custom",
    visionProvider: vision?.provider ?? ai?.provider ?? "openai",
    visionApiKey: "",
    visionKeyNote: "",
    visionKeyId: vision?.hasOwnKey ? (vision.keyId ?? NEW_KEY) : "main",
    visionModel: vision && !visionIsSame ? vision.model : "",
    searchEnabled: Boolean(search?.enabled),
    searchApiKey: "",
    searchKeyNote: "",
    searchKeyId: search?.keyId ?? latestKey(savedKeys, "tavily"),
  };
}

const TAVILY_URL = "https://app.tavily.com";

export function ProviderForm({
  ai,
  search,
  savedKeys,
  onboarding,
  returnTo,
}: {
  ai: PublicUser["ai"];
  search: PublicUser["search"];
  /** Most recently used first within each provider. */
  savedKeys: SavedKeyRow[];
  onboarding?: boolean;
  /** Where to send the learner after saving (a failed run sent them here to change model). */
  returnTo?: string | null;
}) {
  const router = useRouter();
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: defaults(ai, search, savedKeys),
  });
  const v = useWatch({ control: form.control });
  const initialVisionCustom = Boolean(ai?.vision) && defaults(ai, search, savedKeys).visionMode === "custom";
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
  // Set when the learner was sent here to activate a key (theirs was deleted): says what's left to do.
  const [prompt, setPrompt] = useState<"activate" | "add" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const busy =
    form.formState.isSubmitting ||
    redirecting ||
    skipping ||
    connect.status === "redirecting" ||
    connect.status === "connecting";

  const keysFor = (provider: KeyProviderId | undefined) => savedKeys.filter((k) => k.provider === provider);
  // OpenRouter with a key in hand (just connected, or a saved one picked): nothing to type, so hide the key fields.
  const viaOpenRouter = !manual && v.provider === "openrouter" && (connect.status === "connected" || Boolean(v.keyId));
  const selectedModel = main.listing?.models.find((m) => m.id === v.model);
  const modelSupportsImages = selectedModel?.supportsImages !== false;

  /** The key a request should use for a slot: a typed one wins over a saved one. */
  function keyBody(apiKey: string, keyId: string) {
    return apiKey ? { apiKey } : keyId ? { keyId } : null;
  }

  /** Fetches a model listing; returns null when there's no usable key yet. */
  async function requestModels(target: "main" | "vision"): Promise<LoadState | null> {
    const values = form.getValues();
    const provider = target === "main" ? values.provider : values.visionProvider;
    // A vision model on the main provider can borrow the main key.
    const borrowsMain = target === "main" || (values.visionKeyId === "main" && provider === values.provider);
    const key = borrowsMain ? keyBody(values.apiKey, values.keyId) : keyBody(values.visionApiKey, values.visionKeyId);
    if (!key) return null;
    try {
      const listing = await api<Listing>("/api/settings/models", { method: "POST", body: { provider, ...key } });
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
    form.setValue("keyId", NEW_KEY);
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
      form.setValue("keyId", NEW_KEY);
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

  // The saved-keys card deleted a key, or asks to activate one; see saved-key-select.tsx.
  useEffect(() => {
    function onKeyDeleted(e: Event) {
      const { keyId, cleared, user } = (e as CustomEvent<KeyDeletedDetail>).detail;
      const remaining = savedKeys.filter((k) => k.id !== keyId);
      if (cleared.length) {
        // Settings changed on the server: start again from them, which leaves the emptied slots blank.
        form.reset(defaults(user.ai, user.search, remaining));
        setTest({ status: "idle" });
        return;
      }
      // An unused key: only a pick that wasn't saved yet can point at it.
      for (const name of ["keyId", "visionKeyId", "searchKeyId"] as const) {
        if (form.getValues(name) === keyId) form.setValue(name, NEW_KEY);
      }
    }

    function onUseKey(e: Event) {
      const { key } = (e as CustomEvent<UseKeyDetail>).detail;
      setTest({ status: "idle" });
      setConnect({ status: "idle" });
      form.setValue("apiKey", "");
      form.clearErrors("apiKey");
      if (key && key.provider !== "tavily") {
        if (key.provider !== form.getValues("provider")) {
          form.setValue("provider", key.provider);
          form.setValue("model", "");
        }
        form.setValue("keyId", key.id);
        setManual(key.provider !== "openrouter");
        setPrompt("activate");
        void loadModels("main");
      } else {
        form.setValue("keyId", NEW_KEY);
        setManual(true);
        setPrompt("add");
        // Drop the listing (or the refusal) that belonged to the deleted key.
        setMain({ status: "idle" });
      }
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // After the fields for the new state have rendered.
      requestAnimationFrame(() => document.getElementById(key ? "model" : "apiKey")?.focus({ preventScroll: true }));
    }

    window.addEventListener(KEY_DELETED_EVENT, onKeyDeleted);
    window.addEventListener(USE_KEY_EVENT, onUseKey);
    return () => {
      window.removeEventListener(KEY_DELETED_EVENT, onKeyDeleted);
      window.removeEventListener(USE_KEY_EVENT, onUseKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKeys]);

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
        body: { provider: values.provider, ...keyBody(values.apiKey, values.keyId), model: values.model },
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
    const reusesMain = values.visionKeyId === "main" && values.visionProvider === values.provider;
    // A note only goes with a newly typed key; saved keys' notes are edited under Saved API keys.
    const note = (apiKey: string, keyNote: string) => (apiKey && keyNote ? { keyNote } : {});
    const payload: ProviderSettingsInput = {
      provider: values.provider,
      ...keyBody(values.apiKey, values.keyId),
      ...note(values.apiKey, values.keyNote),
      model: values.model,
      vision:
        values.visionMode === "custom"
          ? {
              mode: "custom",
              provider: values.visionProvider,
              model: values.visionModel,
              // No key at all means "reuse the main key".
              ...(!reusesMain && keyBody(values.visionApiKey, values.visionKeyId)),
              ...(!reusesMain && note(values.visionApiKey, values.visionKeyNote)),
            }
          : { mode: values.visionMode },
      // A key typed or picked and then hidden by unticking the box isn't sent.
      search: {
        enabled: values.searchEnabled,
        ...(values.searchEnabled && keyBody(values.searchApiKey, values.searchKeyId)),
        ...(values.searchEnabled && note(values.searchApiKey, values.searchKeyNote)),
      },
    };
    try {
      const { redirectTo, user, searchUsage, rejected } = await api<{
        redirectTo: string;
        user: PublicUser;
        searchUsage: SearchUsage | null;
        rejected: ProviderId[];
      }>("/api/settings/provider", { method: "PUT", body: payload });
      setPrompt(null);
      // Saved anyway (some keys can run models without listing them), but a refused key usually means runs fail.
      for (const provider of rejected) {
        toast.warning(
          `${PROVIDER_LABELS[provider]} rejected the new key, so it's saved but marked as rejected. If analysis fails, pick or add another key.`,
        );
      }
      // A new Tavily key that's already used up still saves, but say so: searches stay off until it resets.
      if (searchUsage?.limit && searchUsage.used >= searchUsage.limit) {
        toast.warning("Your Tavily key is saved, but it has no credits left this month, so web search waits until they reset.");
      }
      if (onboarding) {
        setRedirecting(true);
        toast.success("You're all set! Add your first problem.");
        router.push(redirectTo);
      } else {
        toast.success("AI provider saved");
        form.reset(defaults(user.ai, user.search, savedKeys));
        if (returnTo) setReturning(true);
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save settings.";
      // The server only refuses the search key once it has asked Tavily, so point at that field.
      if (err instanceof ApiClientError && err.code === "search_key_invalid") {
        form.setError("searchApiKey", { message }, { shouldFocus: true });
      }
      toast.error(message);
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
  const mainKeys = keysFor(v.provider);
  const visionKeys = keysFor(v.visionProvider);
  const searchKeys = keysFor("tavily");

  return (
    <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="flex scroll-mt-20 flex-col gap-8" noValidate>
      <fieldset disabled={busy} className="contents">
      <FieldGroup>
        {prompt && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-brand/40 px-3 py-2.5 text-sm">
            <KeyRoundIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-strong" />
            {prompt === "activate"
              ? "Check the model below, then press Save provider to activate this key."
              : "Paste a key from any provider, or sign in with OpenRouter. Then pick a model and press Save provider."}
          </p>
        )}
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
                      // A key typed for the previous provider is wrong for this one; its latest saved key is right.
                      form.setValue("apiKey", "");
                      form.setValue("keyId", latestKey(savedKeys, value));
                      form.clearErrors("apiKey");
                      form.setValue("model", "");
                      // A vision model that borrowed the main key can't once the providers differ.
                      const visionProvider = form.getValues("visionProvider");
                      if (form.getValues("visionKeyId") === "main" && visionProvider !== value) {
                        form.setValue("visionKeyId", latestKey(savedKeys, visionProvider));
                      }
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
              render={({ field, fieldState }) => {
                const keyInput = (
                  <Input
                    {...field}
                    id="apiKey"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={v.keyId ? "Leave blank to keep your saved key" : KEY_HINTS[v.provider ?? "openai"]}
                    aria-label={mainKeys.length ? "New API key" : undefined}
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
                );
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={mainKeys.length ? "keyId" : "apiKey"}>API key</FieldLabel>
                    <div className="flex gap-2">
                      {mainKeys.length ? (
                        <SavedKeySelect
                          id="keyId"
                          keys={mainKeys}
                          value={v.keyId ?? NEW_KEY}
                          invalid={fieldState.invalid}
                          onChange={(id) => {
                            form.setValue("keyId", id);
                            form.setValue("apiKey", "");
                            form.clearErrors("apiKey");
                            setTest({ status: "idle" });
                            if (id) void loadModels("main");
                          }}
                        />
                      ) : (
                        keyInput
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Load models"
                        disabled={main.status === "loading" || (!v.apiKey && !v.keyId)}
                        onClick={() => loadModels("main")}
                      >
                        {main.status === "loading" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                      </Button>
                    </div>
                    {mainKeys.length > 0 && !v.keyId && keyInput}
                    <FieldDescription>
                      {v.keyId
                        ? "Saved keys are encrypted at rest and only decrypted on the server when making AI calls."
                        : "Encrypted at rest and only decrypted on the server when making AI calls. It's saved, so you can switch back to it later without pasting it again."}
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                    {main.status === "error" && <FieldError>{main.error}</FieldError>}
                  </Field>
                );
              }}
            />
            {!v.keyId && <KeyNoteField control={form.control} name="keyNote" />}
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
              <FieldDescription>Select a capable model for better results and analysis.</FieldDescription>
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
                      form.setValue("visionApiKey", "");
                      form.setValue(
                        "visionKeyId",
                        value === form.getValues("provider") ? "main" : latestKey(savedKeys, value),
                      );
                      form.clearErrors("visionApiKey");
                      void loadModels("vision");
                    }}
                  />
                </Field>
              )}
            />
            <Controller
              name="visionApiKey"
              control={form.control}
              render={({ field, fieldState }) => {
                const sameProvider = v.visionProvider === v.provider;
                const hasChoices = sameProvider || visionKeys.length > 0;
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={hasChoices ? "visionKeyId" : "visionApiKey"}>API key</FieldLabel>
                    {hasChoices && (
                      <SavedKeySelect
                        id="visionKeyId"
                        keys={visionKeys}
                        value={v.visionKeyId ?? NEW_KEY}
                        invalid={fieldState.invalid}
                        extra={sameProvider ? [{ value: "main", label: "Same key as the main model" }] : []}
                        onChange={(id) => {
                          form.setValue("visionKeyId", id);
                          form.setValue("visionApiKey", "");
                          form.clearErrors("visionApiKey");
                          if (id) void loadModels("vision");
                        }}
                      />
                    )}
                    {(!hasChoices || !v.visionKeyId) && (
                      <Input
                        {...field}
                        id="visionApiKey"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={KEY_HINTS[v.visionProvider ?? "openai"]}
                        aria-label={hasChoices ? "New API key" : undefined}
                        aria-invalid={fieldState.invalid}
                        onBlur={() => {
                          field.onBlur();
                          if (field.value) void loadModels("vision");
                        }}
                      />
                    )}
                    <FieldError errors={[fieldState.error]} />
                    {vision.status === "error" && <FieldError>{vision.error}</FieldError>}
                  </Field>
                );
              }}
            />
            {!v.visionKeyId && <KeyNoteField control={form.control} name="visionKeyNote" />}
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

      <FieldSet>
        <FieldLegend>Web search</FieldLegend>
        <Controller
          name="searchEnabled"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="searchEnabled"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  if (!checked) form.clearErrors("searchApiKey");
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="searchEnabled">Enable web search</FieldLabel>
                <FieldDescription>
                  Optional. Looks up known solutions to your problem on the web, which helps the AI understand the
                  problem better and check its feedback. Searches use your own Tavily key.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />

        {v.searchEnabled && (
          <Controller
            name="searchApiKey"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={searchKeys.length ? "searchKeyId" : "searchApiKey"}>Tavily API key</FieldLabel>
                {searchKeys.length > 0 && (
                  <SavedKeySelect
                    id="searchKeyId"
                    keys={searchKeys}
                    value={v.searchKeyId ?? NEW_KEY}
                    invalid={fieldState.invalid}
                    onChange={(id) => {
                      form.setValue("searchKeyId", id);
                      form.setValue("searchApiKey", "");
                      form.clearErrors("searchApiKey");
                    }}
                  />
                )}
                {(!searchKeys.length || !v.searchKeyId) && (
                  <Input
                    {...field}
                    id="searchApiKey"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={v.searchKeyId ? "Leave blank to keep your saved key" : "tvly-…"}
                    aria-label={searchKeys.length ? "New Tavily API key" : undefined}
                    aria-invalid={fieldState.invalid}
                  />
                )}
                <FieldDescription>
                  Tavily&apos;s free plan gives 1,000 credits a month (one per search) and needs no credit card.{" "}
                  <a
                    href={TAVILY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-brand-strong underline underline-offset-2"
                  >
                    Get a free key at tavily.com
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {v.searchKeyId ? "." : ", then paste it here."}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
        {v.searchEnabled && !v.searchKeyId && <KeyNoteField control={form.control} name="searchKeyNote" />}
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
