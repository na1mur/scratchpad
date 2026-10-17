"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, InfoIcon, PencilIcon } from "lucide-react";
import { TagPicker } from "@/components/problems/tag-picker";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { MAX_TEXT, createProblemSchema, type CreateProblemInput } from "@/lib/schemas/problems";
import { problemPath } from "@/lib/slug";
import type { Tag } from "@/lib/tags";

/** "leetcode.com" from a full link, for the "fetched from" note. */
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NewProblemForm() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  // The link comes first: the statement is read from it, or typed in by hand on the second step.
  const [stage, setStage] = useState<"link" | "details">("link");
  const [looking, setLooking] = useState(false);
  // The statement came from the link and hasn't been touched; it's shown as a preview until "Edit".
  const [fetched, setFetched] = useState(false);
  const [editing, setEditing] = useState(false);
  // Why the statement has to be typed in, when the link was tried and couldn't be read.
  const [lookupFailed, setLookupFailed] = useState(false);
  const form = useForm<CreateProblemInput>({
    resolver: zodResolver(createProblemSchema),
    defaultValues: { statement: "", sourceUrl: "", tags: [] },
  });
  const sourceUrl = useWatch({ control: form.control, name: "sourceUrl" });

  async function lookUp() {
    const url = (form.getValues("sourceUrl") ?? "").trim();
    if (!(await form.trigger("sourceUrl"))) return;
    if (!url) {
      form.setError("sourceUrl", { message: "Enter the problem's URL, or skip to paste the statement yourself." });
      return;
    }
    setLooking(true);
    try {
      const { statement } = await api<{ statement: string | null }>("/api/problems/statement", {
        method: "POST",
        body: { url },
      });
      // A failed read keeps whatever was typed before going back, but drops an earlier link's statement.
      if (statement) form.setValue("statement", statement, { shouldValidate: true });
      else if (fetched) form.setValue("statement", "");
      setFetched(!!statement);
      setEditing(false);
      setLookupFailed(!statement);
      setStage("details");
    } catch (err) {
      // Not "couldn't read the page" but a failed request (offline, rate limit): stay here so it can be retried.
      toast.error(err instanceof Error ? err.message : "Couldn't look that link up.");
    } finally {
      setLooking(false);
    }
  }

  function skip() {
    form.setValue("sourceUrl", "");
    form.clearErrors("sourceUrl");
    setFetched(false);
    setLookupFailed(false);
    setStage("details");
  }

  async function onSubmit(values: CreateProblemInput) {
    try {
      const { problem } = await api<{ problem: ProblemDetail }>("/api/problems", { method: "POST", body: values });
      setRedirecting(true);
      toast.success("Problem created. Now write your approach.");
      router.push(problemPath(problem));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the problem.");
    }
  }

  const busy = form.formState.isSubmitting || redirecting;
  const url = (sourceUrl ?? "").trim();

  if (stage === "link") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookUp();
        }}
        noValidate
        className="flex flex-col gap-6"
      >
        <fieldset disabled={looking} className="contents">
          <FieldGroup>
            <Controller
              name="sourceUrl"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="sourceUrl">Problem URL</FieldLabel>
                  <Input
                    {...field}
                    id="sourceUrl"
                    type="url"
                    inputMode="url"
                    autoFocus
                    placeholder="https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    We&apos;ll read the statement from the page. Works with LeetCode, Codeforces, AtCoder, HackerRank,
                    GeeksforGeeks, CodeChef and Naukri Code360, and most other problem pages are tried too.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={skip} disabled={looking}>
            Skip, I&apos;ll paste the statement
          </Button>
          <LoadingButton type="submit" loading={looking}>
            {looking ? "Reading the page…" : "Fetch statement"} {!looking && <ArrowRightIcon />}
          </LoadingButton>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <fieldset disabled={busy} className="contents">
        <FieldGroup>
          {lookupFailed && (
            <Alert>
              <InfoIcon aria-hidden />
              <AlertDescription>
                Couldn&apos;t read a statement from {hostOf(url)}; it may need a login or load its problems with
                JavaScript. Paste it below. The link is still saved with the problem.
              </AlertDescription>
            </Alert>
          )}
          <Controller
            name="statement"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="statement">Problem statement</FieldLabel>
                  {fetched && !editing && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                      <PencilIcon /> Edit
                    </Button>
                  )}
                </div>
                {fetched && !editing ? (
                  <>
                    <div
                      id="statement"
                      tabIndex={0}
                      className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-sm whitespace-pre-wrap"
                    >
                      {field.value}
                    </div>
                    <FieldDescription>
                      Read from {hostOf(url)}. Check it looks right, or edit it. The title is generated for you.
                    </FieldDescription>
                  </>
                ) : (
                  <>
                    <Textarea
                      {...field}
                      id="statement"
                      rows={12}
                      maxLength={MAX_TEXT}
                      autoFocus
                      placeholder={"Two Sum II\n\nGiven a 1-indexed array of integers numbers that is sorted in non-decreasing order, find two numbers such that they add up to a specific target…"}
                      aria-invalid={fieldState.invalid}
                      className="min-h-56 font-mono text-sm"
                    />
                    <FieldDescription>
                      Paste it as-is, the title is generated for you. {field.value.length.toLocaleString()}/
                      {MAX_TEXT.toLocaleString()}
                    </FieldDescription>
                  </>
                )}
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
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => setStage("link")} disabled={busy}>
          <ArrowLeftIcon /> Back
        </Button>
        <LoadingButton type="submit" loading={busy}>
          {busy ? "Creating…" : "Continue"} {!busy && <ArrowRightIcon />}
        </LoadingButton>
      </div>
    </form>
  );
}
