"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { GoogleButton } from "@/components/google-button";
import { LoadingButton } from "@/components/loading-button";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GOOGLE_ERRORS, type GoogleErrorCode } from "@/lib/auth/google-errors";
import { api, ApiClientError } from "@/lib/fetcher";
import { loginSchema, safeNextPath, signupSchema, type SignupInput } from "@/lib/schemas/auth";

type Mode = "login" | "signup";

const copy: Record<Mode, { title: string; description: string; submit: string; pending: string }> = {
  login: {
    title: "Welcome back",
    description: "Log in to keep debugging your ideas.",
    submit: "Log in",
    pending: "Logging in…",
  },
  signup: {
    title: "Create your account",
    description: "Bring your own API key. Your reasoning, visualized.",
    submit: "Sign up",
    pending: "Creating your account…",
  },
};

type AuthResponse = { redirectTo: string; user: { name: string | null } };

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Stays true after success so the form stays locked while the next page loads.
  const [redirecting, setRedirecting] = useState(false);
  const form = useForm<SignupInput>({
    resolver: zodResolver(mode === "signup" ? signupSchema : (loginSchema as unknown as typeof signupSchema)),
    defaultValues: { name: "", email: "", password: "" },
  });
  const busy = form.formState.isSubmitting || redirecting;

  // Google sends failures back as /login?error=<code>.
  const oauthError = searchParams.get("error");
  useEffect(() => {
    if (!oauthError) return;
    const message = GOOGLE_ERRORS[oauthError as GoogleErrorCode];
    if (message) toast.error(message, { id: "oauth-error" });
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
    try {
      if (mode === "signup") {
        await api(`/api/auth/signup`, { method: "POST", body: values });
        toast.success("We emailed you a verification code.");
        goToVerify(values.email);
        return;
      }
      const { redirectTo, user } = await api<AuthResponse>(`/api/auth/login`, { method: "POST", body: values });
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
        toast.error(err.message);
      } else if (err instanceof ApiClientError && err.code === "email_not_verified") {
        toast.message(err.message);
        goToVerify(values.email);
      } else {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    }
  }

  const { title, description, submit, pending } = copy[mode];
  return (
    <Card className="w-full max-w-sm shadow-xl shadow-black/5 [--card-spacing:--spacing(6)] dark:shadow-black/40">
      <CardHeader className="justify-items-center text-center">
        <Logo href="/" height={40} priority className="mb-4" />
        <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <fieldset disabled={busy} className="contents">
            <FieldGroup>
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
                      autoComplete="email"
                      placeholder="you@example.com"
                      aria-invalid={fieldState.invalid}
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
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      {mode === "login" && (
                        <Link
                          href="/forgot-password"
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          </fieldset>
          <LoadingButton type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            {busy ? pending : submit}
          </LoadingButton>
          {googleEnabled && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton next={searchParams.get("next")} disabled={busy} />
            </>
          )}
        </CardContent>
        <CardFooter className="mt-6 justify-center">
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link href="/signup" className="text-foreground underline underline-offset-4">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-foreground underline underline-offset-4">
                  Log in
                </Link>
              </>
            )}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
