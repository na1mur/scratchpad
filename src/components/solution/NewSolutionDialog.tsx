"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { cn } from "cn";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { SolutionRequestKind } from "@/lib/ai/schemas/solution";
import { api } from "@/lib/fetcher";
import { MAX_SOLUTION_NOTE, createSolutionSchema, type CreateSolutionInput } from "@/lib/schemas/solutions";
import type { SolutionSummary } from "@/lib/solutions";

const OPTIONS: { kind: Exclude<SolutionRequestKind, "initial">; label: string; detail: string }[] = [
  { kind: "different_approach", label: "A different approach", detail: "Another technique for the same problem." },
  { kind: "better_time", label: "Better time complexity", detail: "Faster in Big-O than what you have." },
  { kind: "better_space", label: "Better space complexity", detail: "Less extra memory in Big-O." },
  { kind: "custom", label: "Something specific", detail: "Describe what you'd like to see." },
];

export type SolutionRequest = { kind: Exclude<SolutionRequestKind, "initial">; note: string };

export function NewSolutionDialog({
  problemId,
  open,
  onOpenChange,
  initial,
  current,
  onCreated,
}: {
  problemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill, e.g. from a suggestion in the chat. */
  initial?: SolutionRequest | null;
  /** The solution being viewed, named in the description so "better" has a reference point. */
  current: SolutionSummary | null;
  onCreated: (solution: SolutionSummary) => void;
}) {
  const form = useForm<CreateSolutionInput>({
    resolver: zodResolver(createSolutionSchema),
    defaultValues: { kind: "different_approach", note: "" },
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  useEffect(() => {
    if (open) form.reset({ kind: initial?.kind ?? "different_approach", note: initial?.note ?? "" });
  }, [open, initial, form]);

  async function onSubmit(values: CreateSolutionInput) {
    try {
      const { solution } = await api<{ solution: SolutionSummary }>(`/api/problems/${problemId}/solutions`, {
        method: "POST",
        body: values,
      });
      onOpenChange(false);
      onCreated(solution);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the solution.");
    }
  }

  const busy = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New solution</DialogTitle>
          <DialogDescription>
            {current?.name
              ? `You're looking at v${current.version}: ${current.name}${current.time ? ` (${current.time} time, ${current.space} space)` : ""}. `
              : ""}
            The new one gets its own code, breakdown and walkthrough, and your other versions stay.
          </DialogDescription>
        </DialogHeader>
        <form id="new-solution" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <fieldset disabled={busy} className="contents">
            <Controller
              name="kind"
              control={form.control}
              render={({ field }) => (
                <div role="radiogroup" aria-label="What kind of solution" className="grid gap-2 sm:grid-cols-2">
                  {OPTIONS.map((o) => (
                    <label
                      key={o.kind}
                      className={cn(
                        "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                        field.value === o.kind ? "border-brand bg-brand-soft" : "hover:bg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={o.kind}
                        checked={field.value === o.kind}
                        onChange={() => field.onChange(o.kind)}
                        className="sr-only"
                      />
                      <span className="font-medium">{o.label}</span>
                      <span className="text-xs text-muted-foreground">{o.detail}</span>
                    </label>
                  ))}
                </div>
              )}
            />
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="solution-note">{kind === "custom" ? "What would you like?" : "Anything specific? (optional)"}</FieldLabel>
                  <Textarea
                    {...field}
                    id="solution-note"
                    rows={3}
                    maxLength={MAX_SOLUTION_NOTE}
                    placeholder={
                      kind === "better_time"
                        ? "e.g. O(n) instead of O(n log n)"
                        : kind === "custom"
                          ? "e.g. Do it recursively, or without extra memory"
                          : "e.g. Use a hash map"
                    }
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Uses your AI provider, like an analysis does.</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton type="submit" form="new-solution" variant="brand" loading={busy}>
            {busy ? "Starting…" : "Generate"}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
