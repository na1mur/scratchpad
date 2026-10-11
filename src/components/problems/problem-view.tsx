"use client";

import { createContext, use, useState } from "react";
import { toast } from "sonner";
import { LayoutGridIcon, TableIcon } from "lucide-react";
import { cn } from "cn";
import { api } from "@/lib/fetcher";
import type { ProblemView } from "@/models/User";

const ViewContext = createContext<{
  view: ProblemView;
  setView: (view: ProblemView) => void;
} | null>(null);

function useView() {
  const ctx = use(ViewContext);
  if (!ctx) throw new Error("ProblemView components must sit inside ProblemViewProvider");
  return ctx;
}

/** Holds the list's view, starting from the saved preference, so the toggle and the list can sit apart. */
export function ProblemViewProvider({ initial, children }: { initial: ProblemView; children: React.ReactNode }) {
  const [view, setViewState] = useState(initial);

  function setView(next: ProblemView) {
    if (next === view) return;
    setViewState(next);
    // A failed save only costs persistence; the list has already switched.
    api("/api/settings/preferences", {
      method: "PATCH",
      body: { problemView: next },
    }).catch(() => toast.error("Couldn't save the view; the list will open as before next time."));
  }

  return <ViewContext value={{ view, setView }}>{children}</ViewContext>;
}

const OPTIONS = [
  { value: "cards", label: "Cards", Icon: LayoutGridIcon },
  { value: "table", label: "Table", Icon: TableIcon },
] as const;

export function ProblemViewToggle({ className }: { className?: string }) {
  const { view, setView } = useView();
  return (
    <div role="group" aria-label="View" className={cn("flex h-8 shrink-0 rounded-lg border bg-sheet p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={label}
            onClick={() => setView(value)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand/50 [&_svg]:size-4",
              active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shows whichever rendering matches the current view; both come from the server. */
export function ProblemViewSwitch({ cards, table }: { cards: React.ReactNode; table: React.ReactNode }) {
  return useView().view === "table" ? table : cards;
}
