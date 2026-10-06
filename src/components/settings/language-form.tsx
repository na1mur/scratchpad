"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { api } from "@/lib/fetcher";
import { LANGUAGES, type LanguageId } from "@/lib/languages";
import { languageSchema, type LanguageInput } from "@/lib/schemas/settings";

export function LanguageForm({
  initial,
  submitLabel,
  onboarding,
}: {
  initial: LanguageId | null;
  submitLabel: string;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const form = useForm<LanguageInput>({
    resolver: zodResolver(languageSchema),
    defaultValues: { language: initial ?? undefined },
  });

  async function onSubmit(values: LanguageInput) {
    try {
      const { redirectTo } = await api<{ redirectTo: string }>("/api/settings/language", {
        method: "PATCH",
        body: values,
      });
      if (onboarding) {
        router.push(redirectTo);
      } else {
        toast.success("Language saved");
        form.reset(values);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save language.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Controller
        name="language"
        control={form.control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label="Programming language" className="grid gap-2 sm:grid-cols-2">
              {LANGUAGES.map((lang) => {
                const selected = field.value === lang.id;
                return (
                  <button
                    key={lang.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(lang.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:bg-muted",
                      selected && "border-primary bg-muted",
                      lang.id === "pseudocode" && "sm:col-span-2",
                    )}
                  >
                    {lang.label}
                    {selected && <CheckIcon className="size-4" />}
                  </button>
                );
              })}
            </div>
            <FieldError errors={[fieldState.error]} />
          </div>
        )}
      />
      <Button
        type="submit"
        className="self-end"
        disabled={form.formState.isSubmitting || (!onboarding && !form.formState.isDirty)}
      >
        {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
