"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { TagPicker } from "@/components/problems/tag-picker";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { MAX_TEXT, createProblemSchema, type CreateProblemInput } from "@/lib/schemas/problems";
import type { Tag } from "@/lib/tags";

export function ProblemActions({ problem }: { problem: ProblemDetail }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const form = useForm<CreateProblemInput>({
    resolver: zodResolver(createProblemSchema),
    defaultValues: { title: problem.title, statement: problem.statement, tags: problem.tags },
  });

  async function onSave(values: CreateProblemInput) {
    try {
      await api(`/api/problems/${problem.id}`, { method: "PATCH", body: values });
      toast.success("Problem updated");
      setDialog(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await api(`/api/problems/${problem.id}`, { method: "DELETE" });
      toast.success("Problem deleted");
      router.replace("/problems");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Problem actions" />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              form.reset({ title: problem.title, statement: problem.statement, tags: problem.tags });
              setDialog("edit");
            }}
          >
            <PencilIcon /> Edit problem
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2Icon /> Delete problem
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "edit"} onOpenChange={(open) => !open && !form.formState.isSubmitting && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit problem</DialogTitle>
            <DialogDescription>Existing attempts keep the analysis they already have.</DialogDescription>
          </DialogHeader>
          <form id="edit-problem" onSubmit={form.handleSubmit(onSave)} noValidate>
            <fieldset disabled={form.formState.isSubmitting} className="contents">
            <FieldGroup>
              <Controller
                name="title"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="edit-title">Title</FieldLabel>
                    <Input {...field} id="edit-title" aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="statement"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="edit-statement">Statement</FieldLabel>
                    <Textarea
                      {...field}
                      id="edit-statement"
                      rows={8}
                      maxLength={MAX_TEXT}
                      className="max-h-72 font-mono text-sm"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="tags"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Tags</FieldLabel>
                    <TagPicker value={(field.value ?? []) as Tag[]} onChange={field.onChange} />
                  </Field>
                )}
              />
            </FieldGroup>
            </fieldset>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <LoadingButton type="submit" form="edit-problem" loading={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && !deleting && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{problem.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the problem, all {problem.attemptCount} attempt{problem.attemptCount === 1 ? "" : "s"}, their
              visualizations, chats and uploaded photos. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={deleting}>
              Cancel
            </Button>
            <LoadingButton variant="destructive" onClick={onDelete} loading={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
