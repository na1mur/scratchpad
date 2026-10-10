"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircleIcon, KeyRoundIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import {
  KEY_DELETED_EVENT,
  USE_KEY_EVENT,
  maskedKey,
  type KeyDeletedDetail,
  type UseKeyDetail,
} from "@/components/settings/saved-key-select";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import type { KeyUse, SavedKeyRow } from "@/lib/providerKeys";
import { KEY_PROVIDER_LABELS } from "@/lib/providers";
import type { PublicUser } from "@/lib/serializers";

const USE_LABELS: Record<KeyUse, string> = {
  main: "Selected model",
  vision: "Vision model",
  search: "Selected web search model",
};
const USE_NAMES: Record<KeyUse, string> = { main: "your main model", vision: "your vision model", search: "web search" };
const USE_EFFECTS: Record<KeyUse, string> = {
  main: "analysis pauses until you activate another key",
  vision: "the vision model turns off",
  search: "web search turns off",
};

type Pending = { kind: "edit" | "delete"; key: SavedKeyRow } | null;

const keyName = (key: SavedKeyRow) => `${KEY_PROVIDER_LABELS[key.provider]} ${maskedKey(key.provider, key.keyLast4)}`;

/** "a, b and c" */
const listWords = (words: string[]) =>
  words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "");

function requestActivation(key: SavedKeyRow | null) {
  window.dispatchEvent(new CustomEvent<UseKeyDetail>(USE_KEY_EVENT, { detail: { key } }));
}

/** Lists every key the learner has entered, to rename or delete. */
export function SavedKeys({ keys }: { keys: SavedKeyRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After the main model's key was deleted: the AI keys left to activate instead.
  const [activate, setActivate] = useState<SavedKeyRow[] | null>(null);

  function open(kind: "edit" | "delete", key: SavedKeyRow) {
    setPending({ kind, key });
    setLabel(key.label ?? "");
    setNote(key.note ?? "");
    setError(null);
  }

  async function submit() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "edit") {
        await api(`/api/settings/keys/${pending.key.id}`, { method: "PATCH", body: { label, note } });
        toast.success("Key details saved");
      } else {
        const keyId = pending.key.id;
        const { cleared, user } = await api<{ cleared: KeyUse[]; user: PublicUser }>(`/api/settings/keys/${keyId}`, {
          method: "DELETE",
        });
        window.dispatchEvent(new CustomEvent<KeyDeletedDetail>(KEY_DELETED_EVENT, { detail: { keyId, cleared, user } }));
        toast.success("Key deleted");
        if (cleared.includes("vision")) toast.info("The vision model is off now. Pick one again in AI provider.");
        if (cleared.includes("search")) toast.info("Web search is off now. Add a Tavily key to turn it back on.");
        if (cleared.includes("main")) setActivate(keys.filter((k) => k.id !== keyId && k.provider !== "tavily"));
      }
      setPending(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function choose(key: SavedKeyRow | null) {
    setActivate(null);
    requestActivation(key);
  }

  const deletingUses = pending?.kind === "delete" ? pending.key.usedBy : [];

  return (
    <>
      {keys.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRoundIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{KEY_PROVIDER_LABELS[key.provider]}</span>
                  <span className="font-mono text-[13px]">{maskedKey(key.provider, key.keyLast4)}</span>
                  {key.label && <span className="truncate text-muted-foreground">{key.label}</span>}
                </p>
                {key.note && (
                  <p className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground" title={key.note}>
                    {key.note}
                  </p>
                )}
                {(key.usedBy.length > 0 || key.rejected) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {key.usedBy.map((use) => (
                      <Badge key={use} className="bg-brand-soft text-brand-strong">
                        {USE_LABELS[use]}
                      </Badge>
                    ))}
                    {key.rejected && <Badge variant="destructive">Rejected</Badge>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit name and note of ${keyName(key)}`}
                  title="Edit name and note"
                  onClick={() => open("edit", key)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${keyName(key)}`}
                  title="Delete"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => open("delete", key)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No saved keys yet. Keys you enter above are kept here, so you can switch providers without pasting them
          again.
        </p>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{pending?.kind === "edit" ? "Edit key" : "Delete this key?"}</DialogTitle>
              <DialogDescription>
                {pending?.kind === "edit"
                  ? `A name and a note help you remember what ${keyName(pending.key)} is for. Only you can see them.`
                  : pending &&
                    `${keyName(pending.key)} will be removed from your saved keys. To use it again, you'll need to paste it in again.`}
              </DialogDescription>
            </DialogHeader>
            {deletingUses.length > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  It&apos;s in use for {listWords(deletingUses.map((u) => USE_NAMES[u]))}, so{" "}
                  {listWords(deletingUses.map((u) => USE_EFFECTS[u]))}.
                </span>
              </p>
            )}
            {pending?.kind === "edit" && (
              <>
                <Field>
                  <FieldLabel htmlFor="keyLabel">Name</FieldLabel>
                  <Input
                    id="keyLabel"
                    value={label}
                    maxLength={40}
                    placeholder="Such as “Work” or “Free tier”"
                    autoFocus
                    disabled={busy}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <FieldDescription>Shown next to the key wherever you pick one.</FieldDescription>
                </Field>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="keyNote">Note</FieldLabel>
                  <Textarea
                    id="keyNote"
                    value={note}
                    rows={3}
                    maxLength={500}
                    placeholder="What it's for, its credit balance, anything you want to remember"
                    disabled={busy}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <FieldDescription>Leave a field empty to remove it.</FieldDescription>
                  {error && <FieldError>{error}</FieldError>}
                </Field>
              </>
            )}
            {pending?.kind === "delete" && error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
              {pending?.kind === "edit" ? (
                <LoadingButton type="submit" loading={busy}>
                  {busy ? "Saving…" : "Save"}
                </LoadingButton>
              ) : (
                <LoadingButton type="submit" variant="destructive" loading={busy}>
                  {busy ? "Deleting…" : "Delete"}
                </LoadingButton>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* The main model just lost its key: ask for another one now rather than picking one silently. */}
      <Dialog open={activate !== null} onOpenChange={(o) => !o && setActivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activate?.length ? "Activate another key" : "Add a key to get started"}</DialogTitle>
            <DialogDescription>
              {activate?.length
                ? "Your main model has no key now, so analysis is paused. Pick one of your saved keys to use instead. You can check the model before saving."
                : "You have no saved AI keys left, so analysis is paused. Add a key from any provider, or sign in with OpenRouter, to keep going."}
            </DialogDescription>
          </DialogHeader>
          {activate && activate.length > 0 && (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {activate.map((key) => (
                <li key={key.id}>
                  <Button variant="outline" className="h-auto w-full justify-start gap-2 py-2" onClick={() => choose(key)}>
                    <KeyRoundIcon aria-hidden className="text-muted-foreground" />
                    <span className="font-medium">{KEY_PROVIDER_LABELS[key.provider]}</span>
                    <span className="font-mono text-[13px]">{maskedKey(key.provider, key.keyLast4)}</span>
                    {key.label && <span className="truncate text-muted-foreground">{key.label}</span>}
                    {key.rejected && (
                      <Badge variant="destructive" className="ml-auto">
                        Rejected
                      </Badge>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivate(null)}>
              Not now
            </Button>
            <Button variant={activate?.length ? "secondary" : "default"} onClick={() => choose(null)}>
              <PlusIcon /> {activate?.length ? "Add a new key instead" : "Add a key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
