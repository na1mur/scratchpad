"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { CodeInput } from "@/components/code-input";
import { LoadingButton } from "@/components/loading-button";
import { Logo } from "@/components/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useCooldown } from "@/hooks/use-cooldown";
import { api, ApiClientError } from "@/lib/fetcher";
import { otpCodeSchema, safeNextPath } from "@/lib/schemas/auth";

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
  // A code was just emailed when we arrive here, so asking for another one waits.
  const cooldown = useCooldown(RESEND_SECONDS);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { code: "" } });
  const busy = form.formState.isSubmitting || redirecting;

  async function onSubmit({ code }: FormValues) {
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
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (err instanceof ApiClientError && err.code === "otp_invalid") {
        form.setError("code", { message });
      } else {
        toast.error(message);
      }
      form.setFocus("code");
    }
  }

  async function resend() {
    setResending(true);
    try {
      await api("/api/auth/verify-email/resend", { method: "POST", body: { email } });
      cooldown.start(RESEND_SECONDS);
      form.reset();
      toast.success("We sent you a new code.");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "otp_cooldown") cooldown.start(RESEND_SECONDS);
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <Card className="w-full max-w-sm shadow-xl shadow-black/5 [--card-spacing:--spacing(6)] dark:shadow-black/40">
        <CardHeader className="justify-items-center text-center">
          <Logo href="/" height={40} priority className="mb-4" />
          <CardTitle className="text-2xl font-semibold tracking-tight">Nothing to verify</CardTitle>
          <CardDescription>Sign up or log in first, and we&apos;ll email you a code.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Back to sign up
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-xl shadow-black/5 [--card-spacing:--spacing(6)] dark:shadow-black/40">
      <CardHeader className="justify-items-center text-center">
        <Logo href="/" height={40} priority className="mb-4" />
        <CardTitle className="text-2xl font-semibold tracking-tight">Check your email</CardTitle>
        <CardDescription>
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It expires in 10
          minutes.
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
                    <FieldLabel htmlFor="code" className="sr-only">
                      Verification code
                    </FieldLabel>
                    <CodeInput {...field} id="code" autoFocus aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          </fieldset>
          <LoadingButton type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            {busy ? "Verifying…" : "Verify email"}
          </LoadingButton>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resend}
            disabled={busy || resending || cooldown.left > 0}
          >
            {cooldown.left > 0 ? `Resend code in ${cooldown.left}s` : resending ? "Sending…" : "Resend code"}
          </Button>
          <Link href="/signup" className="text-sm text-muted-foreground underline underline-offset-4">
            Use a different email
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
