"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon, MessageCircleQuestionIcon, RefreshCwIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SOLUTION_REQUEST_LABELS, type SolutionRequestKind } from "@/lib/ai/schemas/solution";
import type { Step } from "@/lib/ai/schemas/vizSpec";
import { api, apiRaw, toApiError } from "@/lib/fetcher";
import type { ChatEvent, ChatMessage } from "@/lib/messages";
import { MAX_MESSAGE, sendMessageSchema, type SendMessageInput } from "@/lib/schemas/messages";
import { readSSE } from "@/lib/sse";

type Pending = { text: string; regenerating: string | null };
type Proposal = { kind: SolutionRequestKind; note: string };

/**
 * Follow-up chat about a run. `endpoint` is the messages route of an attempt
 * or a solution; both stream the same ChatEvents.
 */
export function ChatPanel({
  endpoint,
  title = "Ask about this run",
  example = <>e.g. &ldquo;Why does left move here?&rdquo; or &ldquo;What happens with duplicates?&rdquo;</>,
  specVersion,
  steps,
  selectedStepIds,
  onToggleStep,
  onClearSelection,
  onSpecVersion,
  onProposal,
}: {
  endpoint: string;
  title?: string;
  example?: React.ReactNode;
  specVersion?: number;
  steps: Step[];
  selectedStepIds: string[];
  onToggleStep: (stepId: string) => void;
  onClearSelection: () => void;
  onSpecVersion?: (version: number) => void;
  /** Solution chat: the model suggested a new solution; the learner decides whether to generate it. */
  onProposal?: (proposal: Proposal) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** The newest suggestion, shown under the answer it came with. */
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const form = useForm<SendMessageInput>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { content: "", focusStepIds: [] },
  });

  useEffect(() => {
    let cancelled = false;
    api<{ messages: ChatMessage[] }>(endpoint)
      .then((r) => !cancelled && setMessages(r.messages))
      .catch(() => !cancelled && setMessages([]));
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages?.length, pending?.text]);

  const stepNumber = (id: string) => steps.findIndex((s) => s.id === id) + 1;

  async function onSend(values: SendMessageInput) {
    setPending({ text: "", regenerating: null });
    setProposal(null);
    try {
      const res = await apiRaw(endpoint, {
        method: "POST",
        body: { content: values.content, focusStepIds: selectedStepIds, specVersion },
      });
      if (!res.ok) throw await toApiError(res);
      form.reset({ content: "", focusStepIds: [] });
      onClearSelection();
      for await (const e of readSSE<ChatEvent>(res)) {
        if (e.type === "user") setMessages((m) => [...(m ?? []), e.message]);
        else if (e.type === "delta") setPending((p) => (p ? { ...p, text: p.text + e.text } : p));
        else if (e.type === "replace") setPending((p) => (p ? { ...p, text: e.text } : p));
        else if (e.type === "regenerating") setPending((p) => (p ? { ...p, regenerating: e.reason } : p));
        else if (e.type === "spec") {
          setPending((p) => (p ? { ...p, regenerating: null } : p));
          toast.success("New visualization ready.");
          onSpecVersion?.(e.specVersion);
        } else if (e.type === "proposal") setProposal({ kind: e.kind, note: e.note });
        else if (e.type === "done") setMessages((m) => [...(m ?? []), e.message]);
        else if (e.type === "error") {
          setMessages((m) => (m ?? []).filter((x) => x.id !== e.discardedMessageId));
          form.setValue("content", values.content);
          toast.error(e.message);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your question.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-tile p-3" aria-label="Ask about this run">
      <header className="flex items-center gap-2">
        <MessageCircleQuestionIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          Shift-click timeline steps to ask about them
        </span>
      </header>

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 && !pending ? (
          <p className="text-sm text-muted-foreground">{example}</p>
        ) : null}
        {messages?.map((m) => (
          <Bubble key={m.id} role={m.role}>
            {m.focusStepIds.length > 0 && (
              <span className="mb-1 block text-xs opacity-70">
                About step{m.focusStepIds.length > 1 ? "s" : ""} {m.focusStepIds.map(stepNumber).filter(Boolean).join(", ")}
              </span>
            )}
            {m.content}
            {m.producedSpecVersion && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0"
                onClick={() => onSpecVersion?.(m.producedSpecVersion!)}
              >
                <RefreshCwIcon /> Show regenerated visualization #{m.producedSpecVersion - 1}
              </Button>
            )}
          </Bubble>
        ))}
        {pending && (
          <Bubble role="assistant">
            {pending.regenerating && (
              <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" /> Building a new visualization: {pending.regenerating}
              </span>
            )}
            {pending.text || (!pending.regenerating && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />)}
          </Bubble>
        )}
        {proposal && onProposal && !pending && (
          <div className="flex flex-wrap items-center gap-2 self-start rounded-lg border border-brand bg-brand-soft px-3 py-2 text-sm">
            <SparklesIcon className="size-4 shrink-0 text-brand-strong" aria-hidden />
            <span className="min-w-0">
              {SOLUTION_REQUEST_LABELS[proposal.kind]}
              {proposal.note && <span className="text-muted-foreground">: {proposal.note}</span>}
            </span>
            <Button variant="brand" size="xs" onClick={() => onProposal(proposal)}>
              Review and generate
            </Button>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {selectedStepIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedStepIds.map((id) => {
            const step = steps.find((s) => s.id === id);
            return (
              <span key={id} className="flex items-center gap-1 rounded-full border bg-sheet px-2 py-0.5 text-xs">
                Step {stepNumber(id)}: <span className="max-w-40 truncate">{step?.title}</span>
                <button type="button" aria-label="Remove step" onClick={() => onToggleStep(id)}>
                  <XIcon className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSend)} className="flex items-end gap-2" noValidate>
        <Controller
          name="content"
          control={form.control}
          render={({ field }) => (
            <Textarea
              {...field}
              rows={2}
              maxLength={MAX_MESSAGE}
              placeholder="Ask why something happens…"
              aria-label="Your question"
              disabled={Boolean(pending)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void form.handleSubmit(onSend)();
                }
              }}
              className="min-h-0 flex-1 resize-none"
            />
          )}
        />
        <Button type="submit" variant="brand" size="icon" aria-label="Send" disabled={Boolean(pending)}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        </Button>
      </form>
    </section>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
        role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start border bg-sheet",
      )}
    >
      {children}
    </div>
  );
}
