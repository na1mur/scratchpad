"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { toast } from "sonner";
import { GoogleButton } from "@/components/google-button";
import { LoadingButton } from "@/components/loading-button";
import { PasswordInput } from "@/components/password-input";
import { PasswordRules } from "@/components/password-rules";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GOOGLE_ERRORS, type GoogleErrorCode } from "@/lib/auth/google-errors";
import { api, ApiClientError } from "@/lib/fetcher";
import { loginSchema, safeNextPath, signupSchema, type SignupInput } from "@/lib/schemas/auth";
import { AuthHeading, FormAlert, authButton, authInput, authLink, inkButton } from "./auth-ui";

type Mode = "login" | "signup";

const copy: Record<Mode, { title: string; description: string; submit: string; pending: string }> = {
  login: {
    title: "Welcome back",
    description: "Log in to pick up where you left off.",
    submit: "Log in",
    pending: "Logging in…",
  },
  signup: {
    title: "Create your account",
    description: "You'll add your own AI provider key once you're in.",
    submit: "Create account",
    pending: "Creating your account…",
  },
};

type AuthResponse = { redirectTo: string; user: { name: string | null } };

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Stays true after success so the form stays locked while the next page loads.
  const [redirecting, setRedirecting] = useState(false);
  // A problem with the whole attempt (wrong password, network), as opposed to one field. Google sends
  // its failures back as /login?error=<code>, so that's where it starts.
  const oauthError = searchParams.get("error");
  const [formError, setFormError] = useState<string | null>(
    () => GOOGLE_ERRORS[oauthError as GoogleErrorCode] ?? null,
  );
  const form = useForm<SignupInput>({
    resolver: zodResolver(mode === "signup" ? signupSchema : (loginSchema as unknown as typeof signupSchema)),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const password = useWatch({ control: form.control, name: "password" });
  const busy = form.formState.isSubmitting || redirecting;
  // The fieldset is disabled while submitting, and a disabled field can't take focus, so focus waits for it.
  const [focusEmail, setFocusEmail] = useState(false);
  useEffect(() => {
    if (focusEmail && !busy) form.setFocus("email");
  }, [focusEmail, busy, form]);

  // Keep the code out of the address bar so a reload or shared link doesn't replay the error.
  useEffect(() => {
    if (!oauthError) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  }, [oauthError]);

  function goToVerify(email: string) {
    setRedirecting(true);
    const params = new URLSearchParams({ email });
    const next = searchParams.get("next");
    if (next) params.set("next", next);
    router.push(`/verify-email?${params}`);
  }

  async function onSubmit(values: SignupInput) {
    setFormError(null);
    setFocusEmail(false);
    try {
      if (mode === "signup") {
        await api(`/api/auth/signup`, { method: "POST", body: values });
        toast.success("We emailed you a verification code.");
        goToVerify(values.email);
        return;
      }
      const { redirectTo, user } = await api<AuthResponse>(`/api/auth/login`, {
        method: "POST",
        body: values,
        skipRefresh: true,
      });
      setRedirecting(true);
      const first = user.name?.split(/\s+/)[0];
      toast.success(first ? `Welcome back, ${first}.` : "Welcome back.");
      // `next` only matters once onboarding is done; otherwise onboarding wins.
      const next = searchParams.get("next");
      router.replace(redirectTo === "/problems" ? safeNextPath(next) : redirectTo);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "email_taken") {
        form.setError("email", { message: err.message });
        setFocusEmail(true);
      } else if (err instanceof ApiClientError && err.code === "email_not_verified") {
        toast.message(err.message);
        goToVerify(values.email);
      } else {
        setFormError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    }
  }

  const { title, description, submit, pending } = copy[mode];
  return (
    <>
      <AuthHeading title={title}>{description}</AuthHeading>
      {googleEnabled && (
        <>
          <GoogleButton next={searchParams.get("next")} disabled={busy} className="h-11 text-base" />
          <div aria-hidden className="my-5 flex items-center gap-3 text-sm text-ink/70">
            <span className="h-px flex-1 bg-ink/15" />
            or use your email
            <span className="h-px flex-1 bg-ink/15" />
          </div>
        </>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={busy} className="contents">
          <FieldGroup className="gap-4">
            {mode === "signup" && (
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input
                      {...field}
                      id="name"
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                      aria-invalid={fieldState.invalid}
                      className={authInput}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@example.com"
                    aria-invalid={fieldState.invalid}
                    className={authInput}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    {mode === "login" && (
                      <Link href="/forgot-password" className={cn(authLink, "text-sm font-normal")}>
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <PasswordInput
                    {...field}
                    id="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "login" ? "Your password" : "Choose a password"}
                    aria-invalid={fieldState.invalid}
                    className={authInput}
                  />
                  <FieldError errors={[fieldState.error]} />
                  {mode === "signup" && <PasswordRules value={password} />}
                </Field>
              )}
            />
            {mode === "signup" && (
              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="confirmPassword">Repeat password</FieldLabel>
                    <PasswordInput
                      {...field}
                      id="confirmPassword"
                      autoComplete="new-password"
                      placeholder="Type it again"
                      aria-invalid={fieldState.invalid}
                      className={authInput}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
          </FieldGroup>
        </fieldset>
        {formError && <FormAlert className="mt-6">{formError}</FormAlert>}
        <LoadingButton type="submit" size="lg" className={cn(authButton, inkButton, "mt-6")} loading={busy}>
          {busy ? pending : submit}
        </LoadingButton>
      </form>
      <p className="mt-8 text-ink/75">
        {mode === "login" ? (
          <>
            New to Scratchpad?{" "}
            <Link href="/signup" className={authLink}>
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className={authLink}>
              Log in
            </Link>
          </>
        )}
      </p>
    </>
  );
}
