"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CodeInput } from "@/components/code-input";
import { LoadingButton } from "@/components/loading-button";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCooldown } from "@/hooks/use-cooldown";
import { api, ApiClientError } from "@/lib/fetcher";
import {
  emailOnlySchema,
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/schemas/auth";

const RESEND_SECONDS = 60;

type EmailValues = { email: string };

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const cooldown = useCooldown();
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  async function requestCode({ email }: EmailValues) {
    try {
      await api("/api/auth/password/forgot", { method: "POST", body: { email } });
      setEmail(email.trim().toLowerCase());
      cooldown.start(RESEND_SECONDS);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "otp_cooldown") {
        // A code went out a moment ago (e.g. this was a double click); carry on to the code step.
        setEmail(email.trim().toLowerCase());
        cooldown.start(RESEND_SECONDS);
      }
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (email) {
    return (
      <ResetStep
        email={email}
        cooldownLeft={cooldown.left}
        onResend={async () => {
          try {
            await api("/api/auth/password/forgot", { method: "POST", body: { email } });
            toast.success("If that email has an account, we sent a new code.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
          }
          cooldown.start(RESEND_SECONDS);
        }}
        onChangeEmail={() => setEmail(null)}
      />
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-xl shadow-black/5 [--card-spacing:--spacing(6)] dark:shadow-black/40">
      <CardHeader className="justify-items-center text-center">
        <Logo href="/" height={40} priority className="mb-4" />
        <CardTitle className="text-2xl font-semibold tracking-tight">Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a code to choose a new one.</CardDescription>
      </CardHeader>
      <form onSubmit={emailForm.handleSubmit(requestCode)} noValidate>
        <CardContent>
          <fieldset disabled={emailForm.formState.isSubmitting} className="contents">
            <FieldGroup>
              <Controller
                name="email"
                control={emailForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      autoFocus
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          </fieldset>
          <LoadingButton type="submit" size="lg" className="mt-6 w-full" loading={emailForm.formState.isSubmitting}>
            {emailForm.formState.isSubmitting ? "Sending code…" : "Send code"}
          </LoadingButton>
        </CardContent>
        <CardFooter className="mt-6 justify-center">
          <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to log in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

function ResetStep({
  email,
  cooldownLeft,
  onResend,
  onChangeEmail,
}: {
  email: string;
  cooldownLeft: number;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, code: "", password: "" },
  });
  const busy = form.formState.isSubmitting || done;

  async function onSubmit(values: ResetPasswordInput) {
    try {
      await api("/api/auth/password/reset", { method: "POST", body: { ...values, email } });
      setDone(true);
      toast.success("Password updated. Log in with your new password.");
      router.replace("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (err instanceof ApiClientError && err.code === "otp_invalid") {
        form.setError("code", { message });
      } else if (err instanceof ApiClientError && err.fields?.password?.[0]) {
        form.setError("password", { message: err.fields.password[0] });
      } else {
        toast.error(message);
      }
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-xl shadow-black/5 [--card-spacing:--spacing(6)] dark:shadow-black/40">
      <CardHeader className="justify-items-center text-center">
        <Logo href="/" height={40} priority className="mb-4" />
        <CardTitle className="text-2xl font-semibold tracking-tight">Choose a new password</CardTitle>
        <CardDescription>
          If <span className="font-medium text-foreground">{email}</span> has an account, we sent it a 6-digit code.
          It expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <fieldset disabled={busy} className="contents">
            <FieldGroup>
              <Controller
                name="code"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="code">Code</FieldLabel>
                    <CodeInput {...field} id="code" autoFocus invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="password">New password</FieldLabel>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                    <FieldDescription>You&apos;ll be signed out on all your devices.</FieldDescription>
                  </Field>
                )}
              />
            </FieldGroup>
          </fieldset>
          <LoadingButton type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            {busy ? "Updating password…" : "Update password"}
          </LoadingButton>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || resending || cooldownLeft > 0}
            onClick={async () => {
              setResending(true);
              await onResend();
              setResending(false);
            }}
          >
            {cooldownLeft > 0 ? `Resend code in ${cooldownLeft}s` : resending ? "Sending…" : "Resend code"}
          </Button>
          <button
            type="button"
            onClick={onChangeEmail}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Use a different email
          </button>
        </CardFooter>
      </form>
    </Card>
  );
}
