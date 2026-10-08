"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { toast } from "sonner";
import { CodeInput } from "@/components/code-input";
import { LoadingButton } from "@/components/loading-button";
import { PasswordInput } from "@/components/password-input";
import { PasswordRules } from "@/components/password-rules";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCooldown } from "@/hooks/use-cooldown";
import { api, ApiClientError } from "@/lib/fetcher";
import { emailOnlySchema, resetPasswordSchema, type ResetPasswordInput } from "@/lib/schemas/auth";
import { AuthHeading, FormAlert, authButton, authInput, authLink, inkButton } from "../auth-ui";

const RESEND_SECONDS = 60;

type EmailValues = { email: string };

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const cooldown = useCooldown();
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  async function requestCode({ email }: EmailValues) {
    setFormError(null);
    try {
      await api("/api/auth/password/forgot", { method: "POST", body: { email } });
      setEmail(email.trim().toLowerCase());
      cooldown.start(RESEND_SECONDS);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "otp_cooldown") {
        // A code went out a moment ago (e.g. this was a double click); carry on to the code step.
        setEmail(email.trim().toLowerCase());
        cooldown.start(RESEND_SECONDS);
        toast.message(err.message);
        return;
      }
      setFormError(err instanceof Error ? err.message : "Something went wrong. Try again.");
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
            toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
          }
          cooldown.start(RESEND_SECONDS);
        }}
        onChangeEmail={() => setEmail(null)}
      />
    );
  }

  const sending = emailForm.formState.isSubmitting;
  return (
    <>
      <AuthHeading title="Forgot your password?">
        Enter your email and we&apos;ll send you a code to choose a new one.
      </AuthHeading>
      <form onSubmit={emailForm.handleSubmit(requestCode)} noValidate>
        <fieldset disabled={sending} className="contents">
          <FieldGroup className="gap-4">
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
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@example.com"
                    autoFocus
                    aria-invalid={fieldState.invalid}
                    className={authInput}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </fieldset>
        {formError && <FormAlert className="mt-6">{formError}</FormAlert>}
        <LoadingButton type="submit" size="lg" className={cn(authButton, inkButton, "mt-6")} loading={sending}>
          {sending ? "Sending code…" : "Send code"}
        </LoadingButton>
      </form>
      <p className="mt-8 text-ink/75">
        Remembered it?{" "}
        <Link href="/login" className={authLink}>
          Back to log in
        </Link>
      </p>
    </>
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
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, code: "", password: "", confirmPassword: "" },
  });
  const password = useWatch({ control: form.control, name: "password" });
  const busy = form.formState.isSubmitting || done;
  // The fieldset is disabled while submitting, and a disabled field can't take focus, so focus waits for it.
  const [focusField, setFocusField] = useState<"code" | "password" | null>(null);
  useEffect(() => {
    if (focusField && !busy) form.setFocus(focusField);
  }, [focusField, busy, form]);

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    setFocusField(null);
    try {
      await api("/api/auth/password/reset", { method: "POST", body: { ...values, email } });
      setDone(true);
      toast.success("Password updated. Log in with your new password.");
      router.replace("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      if (err instanceof ApiClientError && err.code === "otp_invalid") {
        form.setError("code", { message });
        setFocusField("code");
      } else if (err instanceof ApiClientError && err.fields?.password?.[0]) {
        form.setError("password", { message: err.fields.password[0] });
        setFocusField("password");
      } else {
        setFormError(message);
      }
    }
  }

  return (
    <>
      <AuthHeading title="Choose a new password">
        If <span className="font-medium break-words text-ink">{email}</span> has an account, we sent it a 6-digit code.
        It expires in 10 minutes.
      </AuthHeading>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={busy} className="contents">
          <FieldGroup className="gap-4">
            <Controller
              name="code"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="code">Code from your email</FieldLabel>
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
                  <PasswordInput
                    {...field}
                    id="password"
                    autoComplete="new-password"
                    placeholder="Choose a password"
                    aria-invalid={fieldState.invalid}
                    className={authInput}
                  />
                  <FieldError errors={[fieldState.error]} />
                  <PasswordRules value={password} />
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirmPassword">Repeat new password</FieldLabel>
                  <PasswordInput
                    {...field}
                    id="confirmPassword"
                    autoComplete="new-password"
                    placeholder="Type it again"
                    aria-invalid={fieldState.invalid}
                    className={authInput}
                  />
                  <FieldError errors={[fieldState.error]} />
                  <FieldDescription className="text-ink/70">You&apos;ll be signed out on all your devices.</FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </fieldset>
        {formError && <FormAlert className="mt-6">{formError}</FormAlert>}
        <LoadingButton type="submit" size="lg" className={cn(authButton, inkButton, "mt-6")} loading={busy}>
          {busy ? "Updating password…" : "Update password"}
        </LoadingButton>
      </form>
      <p className="mt-8 text-ink/75">
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          disabled={busy || resending || cooldownLeft > 0}
          onClick={async () => {
            setResending(true);
            await onResend();
            setResending(false);
          }}
          className={cn(authLink, "disabled:text-ink/60 disabled:no-underline")}
        >
          {cooldownLeft > 0 ? `resend in ${cooldownLeft}s` : resending ? "sending…" : "resend the code"}
        </button>
      </p>
      <p className="mt-3 text-ink/75">
        Wrong address?{" "}
        <button type="button" onClick={onChangeEmail} className={authLink}>
          Use a different email
        </button>
      </p>
    </>
  );
}
