"use client";

import { useState } from "react";
import { LockIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

const HINTS = [
  "Look back at the input you started with. What did your approach quietly assume about the order of its values?",
  "Each time hi moves left, it rules a value out for good. Before 7 was ruled out, did you check every number it could pair with?",
  "Walk 7 through your loop by hand. Where is its partner at that moment, and can your two pointers still reach it?",
];

export function HintLadder() {
  const [shown, setShown] = useState(1);
  // Revealing a hint unmounts the button that was focused, so hand focus to the new hint.
  const [interacted, setInteracted] = useState(false);
  const done = shown === HINTS.length;

  return (
    <ol className="border-t border-ink/20">
      {HINTS.map((hint, i) => {
        const revealed = i < shown;
        return (
          <li key={i} className="flex gap-5 border-b border-ink/20 py-5">
            <span
              aria-hidden
              className={cn("w-7 shrink-0 font-hand text-4xl leading-none", revealed ? "text-pen-blue" : "text-ink/30")}
            >
              {i + 1}
            </span>
            {revealed ? (
              <p
                ref={(el) => {
                  if (el && interacted && i === shown - 1) el.focus({ preventScroll: true });
                }}
                tabIndex={-1}
                className="text-lg leading-7 outline-none animate-in duration-500 fade-in slide-in-from-top-1 motion-reduce:animate-none"
              >
                <span className="sr-only">Hint {i + 1}: </span>
                {hint}
              </p>
            ) : (
              <div className="flex-1 space-y-2.5 pt-1">
                <span className="sr-only">Hint {i + 1} is hidden.</span>
                <div aria-hidden className="h-2.5 w-full rounded-full bg-ink/10" />
                <div aria-hidden className="h-2.5 w-2/3 rounded-full bg-ink/10" />
                {i === shown && (
                  <Button variant="outline" size="sm" className="mt-1.5" onClick={() => {
                      setInteracted(true);
                      setShown(i + 1);
                    }}>
                    Show hint {i + 1}
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
      <li className="flex items-center gap-5 py-5 text-ink/65">
        <LockIcon aria-hidden className="mx-1 size-5 shrink-0" />
        <p className={cn("font-hand text-2xl leading-6", done && "text-ink")}>
          There is no fourth hint that writes the code for you.
        </p>
      </li>
    </ol>
  );
}
