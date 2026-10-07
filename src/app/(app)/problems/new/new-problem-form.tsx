"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRightIcon } from "lucide-react";
import { TagPicker } from "@/components/problems/tag-picker";
import { LoadingButton } from "@/components/loading-button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { MAX_TEXT, createProblemSchema, type CreateProblemInput } from "@/lib/schemas/problems";
import type { Tag } from "@/lib/tags";

export function NewProblemForm() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const form = useForm<CreateProblemInput>({
    resolver: zodResolver(createProblemSchema),
    defaultValues: { statement: "", sourceUrl: "", tags: [] },
  });

  async function onSubmit(values: CreateProblemInput) {
    try {
      const { problem } = await api<{ problem: ProblemDetail }>("/api/problems", { method: "POST", body: values });
      setRedirecting(true);
      toast.success("Problem created. Now write your approach.");
      router.push(`/problems/${problem.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the problem.");
    }
  }

  const busy = form.formState.isSubmitting || redirecting;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <fieldset disabled={busy} className="contents">
      <FieldGroup>
        <Controller
          name="statement"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="statement">Problem statement</FieldLabel>
              <Textarea
                {...field}
                id="statement"
                rows={12}
                maxLength={MAX_TEXT}
                placeholder={"Two Sum II\n\nGiven a 1-indexed array of integers numbers that is sorted in non-decreasing order, find two numbers such that they add up to a specific target…"}
                aria-invalid={fieldState.invalid}
                className="min-h-56 font-mono text-sm"
              />
              <FieldDescription>
                Paste it as-is, the title is generated for you. {field.value.length.toLocaleString()}/{MAX_TEXT.toLocaleString()}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="sourceUrl"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sourceUrl">Problem URL (optional)</FieldLabel>
              <Input
                {...field}
                id="sourceUrl"
                type="url"
                inputMode="url"
                placeholder="https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Link back to where the problem came from, e.g. LeetCode.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="tags"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="tags">Tags (optional)</FieldLabel>
              <FieldDescription>Leave empty and they&apos;ll be suggested after your first attempt.</FieldDescription>
              <TagPicker id="tags" value={(field.value ?? []) as Tag[]} onChange={field.onChange} />
            </Field>
          )}
        />
      </FieldGroup>
      </fieldset>
      <LoadingButton type="submit" className="self-end" loading={busy}>
        {busy ? "Creating…" : "Continue"} {!busy && <ArrowRightIcon />}
      </LoadingButton>
    </form>
  );
}
