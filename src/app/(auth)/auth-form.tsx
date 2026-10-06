"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/fetcher";
import { credentialsSchema, safeNextPath, type Credentials } from "@/lib/schemas/auth";

type Mode = "login" | "signup";

const copy: Record<Mode, { title: string; description: string; submit: string }> = {
  login: { title: "Welcome back", description: "Log in to keep debugging your ideas.", submit: "Log in" },
  signup: {
    title: "Create your account",
    description: "Bring your own API key. Your reasoning, visualized.",
    submit: "Sign up",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Credentials) {
    try {
      const { redirectTo } = await api<{ redirectTo: string }>(`/api/auth/${mode}`, {
        method: "POST",
        body: values,
      });
      // `next` only matters once onboarding is done; otherwise onboarding wins.
      const next = searchParams.get("next");
      router.replace(redirectTo === "/problems" ? safeNextPath(next) : redirectTo);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "email_taken") {
        form.setError("email", { message: err.message });
      } else {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    }
  }

  const { title, description, submit } = copy[mode];
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
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
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
            {submit}
          </Button>
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
