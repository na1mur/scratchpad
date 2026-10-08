"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { toast } from "sonner";
import { z } from "zod";
import { CodeInput } from "@/components/code-input";
import { LoadingButton } from "@/components/loading-button";
import { buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useCooldown } from "@/hooks/use-cooldown";
import { api, ApiClientError } from "@/lib/fetcher";
import { otpCodeSchema, safeNextPath } from "@/lib/schemas/auth";
import { AuthHeading, FormAlert, authButton, authLink, inkButton } from "../auth-ui";

const formSchema = z.object({ code: otpCodeSchema });
type FormValues = z.infer<typeof formSchema>;
type AuthResponse = { redirectTo: string; user: { name: string | null } };

const RESEND_SECONDS = 60;

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const [redirecting, setRedirecting] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // A code was just emailed when we arrive here, so asking for another one waits.
  const cooldown = useCooldown(RESEND_SECONDS);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { code: "" } });
  const busy = form.formState.isSubmitting || redirecting;
  // The fieldset is disabled while submitting, and a disabled field can't take focus, so focus waits for it.
  const [focusCode, setFocusCode] = useState(false);
  useEffect(() => {
    if (focusCode && !busy) form.setFocus("code");
  }, [focusCode, busy, form]);

  async function onSubmit({ code }: FormValues) {
    setFormError(null);
    setFocusCode(false);
    try {
      const { redirectTo, user } = await api<AuthResponse>("/api/auth/verify-email", {
        method: "POST",
        body: { email, code },
      });
      setRedirecting(true);
      const first = user.name?.split(/\s+/)[0];
      toast.success(first ? `Welcome, ${first}! Let's get you set up.` : "Email verified. Let's get you set up.");
      // `next` only matters once onboarding is done; otherwise onboarding wins.
      router.replace(redirectTo === "/problems" ? safeNextPath(searchParams.get("next")) : redirectTo);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      if (err instanceof ApiClientError && err.code === "otp_invalid") {
        form.setError("code", { message });
      } else {
        setFormError(message);
      }
      setFocusCode(true);
    }
  }

  async function resend() {
    setResending(true);
    setFormError(null);
    try {
      await api("/api/auth/verify-email/resend", { method: "POST", body: { email } });
      cooldown.start(RESEND_SECONDS);
      form.reset();
      form.setFocus("code");
      toast.success("We sent you a new code.");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "otp_cooldown") cooldown.start(RESEND_SECONDS);
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <>
        <AuthHeading title="Nothing to verify">Sign up or log in first, and we&apos;ll email you a code.</AuthHeading>
        <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), authButton, inkButton)}>
          Back to sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Check your email">
        We sent a 6-digit code to <span className="font-medium break-words text-ink">{email}</span>. It expires in
        10 minutes.
      </AuthHeading>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={busy} className="contents">
          <FieldGroup className="gap-4">
            <Controller
              name="code"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="code">Verification code</FieldLabel>
                  {/* Submits itself once all six digits are in, whether typed or pasted. */}
                  <CodeInput
                    {...field}
                    id="code"
                    autoFocus
                    invalid={fieldState.invalid}
                    onComplete={() => form.handleSubmit(onSubmit)()}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </fieldset>
        {formError && <FormAlert className="mt-6">{formError}</FormAlert>}
        <LoadingButton type="submit" size="lg" className={cn(authButton, inkButton, "mt-6")} loading={busy}>
          {busy ? "Verifying…" : "Verify email"}
        </LoadingButton>
      </form>
      <p className="mt-8 text-ink/75">
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={resend}
          disabled={busy || resending || cooldown.left > 0}
          className={cn(authLink, "disabled:text-ink/60 disabled:no-underline")}
        >
          {cooldown.left > 0 ? `resend in ${cooldown.left}s` : resending ? "sending…" : "resend the code"}
        </button>
      </p>
      <p className="mt-3 text-ink/75">
        Wrong address?{" "}
        <Link href="/signup" className={authLink}>
          Use a different email
        </Link>
      </p>
    </>
  );
}
