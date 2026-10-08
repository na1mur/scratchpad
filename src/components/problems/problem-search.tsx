"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

const DEBOUNCE_MS = 300;

/** Debounced search that lives in the URL (?q=), resetting to page 1. */
export function ProblemSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);

  // Follow the URL when it changes elsewhere (e.g. "Clear filters"), but never overwrite what's being typed.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== value.trim()) setValue(urlQuery);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  function onClear() {
    clearTimeout(timer.current);
    setValue("");
    push("");
    input.current?.focus();
  }

  return (
    <InputGroup className="sm:w-72">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={input}
        type="search"
        placeholder="Search titles and statements"
        aria-label="Search problems"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      <InputGroupAddon align="inline-end">
        {pending ? (
          <Loader2Icon className="animate-spin" role="status" aria-label="Searching" />
        ) : (
          value && (
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={onClear}>
              <XIcon />
            </InputGroupButton>
          )
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
