"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, ExternalLinkIcon, Share2Icon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/fetcher";
import { sharedPath } from "@/lib/sharePaths";
import type { ShareKind } from "@/models/Share";

const COPY = {
  attempt: {
    title: "Share this attempt",
    off: "Anyone with the link can see the problem, your pseudo-code and idea, and the run, without logging in. Your chat stays private.",
    on: "Anyone with this link can see the problem, this attempt and its run, and fork the problem into their own account.",
  },
  solution: {
    title: "Share this solution",
    off: "Anyone with the link can see the problem and this solution version with its walkthrough, without logging in. Your chat stays private.",
    on: "Anyone with this link can see this solution and fork the problem into their own account.",
  },
} as const;

/**
 * Makes one attempt or solution version public, or private again. Unsharing kills the link for good;
 * sharing again makes a new one.
 */
export function ShareButton({
  kind,
  targetId,
  token: initialToken,
  onChange,
  disabled,
}: {
  kind: ShareKind;
  targetId: string;
  token: string | null;
  onChange?: (token: string | null) => void;
  disabled?: boolean;
}) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/${kind === "attempt" ? "attempts" : "solutions"}/${targetId}/share`;
  const url = token && typeof window !== "undefined" ? `${window.location.origin}${sharedPath(kind, token)}` : "";

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  function update(next: string | null) {
    setToken(next);
    onChange?.(next);
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function share() {
    setBusy(true);
    try {
      const { token: next } = await api<{ token: string }>(endpoint, { method: "PUT" });
      update(next);
      await copy(`${window.location.origin}${sharedPath(kind, next)}`);
      toast.success("Public link created and copied.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't share.");
    } finally {
      setBusy(false);
    }
  }

  async function unshare() {
    setBusy(true);
    try {
      await api(endpoint, { method: "DELETE" });
      update(null);
      toast.success("Stopped sharing. The old link no longer works.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't stop sharing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={token ? "soft" : "outline"} size="sm" disabled={disabled} aria-label={COPY[kind].title} />
        }
      >
        <Share2Icon /> {token ? "Shared" : "Share"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{COPY[kind].title}</PopoverTitle>
          <PopoverDescription>{token ? COPY[kind].on : COPY[kind].off}</PopoverDescription>
        </PopoverHeader>
        {token ? (
          <>
            <InputGroup>
              <InputGroupInput
                readOnly
                value={url}
                aria-label="Public link"
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Copy link" onClick={() => void copy(url)}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </InputGroupButton>
                <a
                  href={sharedPath(kind, token)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the public page"
                  className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                >
                  <ExternalLinkIcon />
                </a>
              </InputGroupAddon>
            </InputGroup>
            <LoadingButton variant="destructive" size="sm" loading={busy} onClick={unshare}>
              {busy ? "Stopping…" : "Stop sharing"}
            </LoadingButton>
          </>
        ) : (
          <LoadingButton variant="brand" size="sm" loading={busy} icon={<Share2Icon />} onClick={share}>
            {busy ? "Creating link…" : "Create public link"}
          </LoadingButton>
        )}
      </PopoverContent>
    </Popover>
  );
}
