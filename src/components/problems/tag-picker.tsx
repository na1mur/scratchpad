"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { TAGS, type Tag } from "@/lib/tags";

/** Toggle chips for the fixed tag list. */
export function TagPicker({
  value,
  onChange,
  id,
}: {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  id?: string;
}) {
  const selected = new Set(value);
  function toggle(tag: Tag) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(TAGS.filter((t) => next.has(t)));
  }
  return (
    <div id={id} role="group" aria-label="Tags" className="flex flex-wrap gap-1.5">
      {TAGS.map((tag) => {
        const on = selected.has(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(tag)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {on && <CheckIcon className="size-3" />}
            {tag}
          </button>
        );
      })}
    </div>
  );
}
