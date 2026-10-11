"use client";

import { ChevronDownIcon } from "lucide-react";
import { SourceLink } from "@/components/problems/source-link";
import { ForkButton, type SharedViewer } from "@/components/share/fork-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SharedProblem } from "@/lib/shares";

/** Title, topics and statement of a shared problem, with the fork button beside them. */
export function SharedProblemHeader({
  eyebrow,
  problem,
  token,
  viewer,
  ownerSlug,
}: {
  eyebrow: string;
  problem: SharedProblem;
  token: string;
  viewer: SharedViewer;
  ownerSlug: string;
}) {
  return (
    <Collapsible defaultOpen>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-brand-strong uppercase">{eyebrow}</p>
          <h1 className="text-2xl leading-snug font-semibold tracking-tight text-balance">{problem.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {problem.tags.length > 0 && (
              <ul className="flex flex-wrap items-center gap-1" aria-label="Topics">
                {problem.tags.map((t) => (
                  <li key={t}>
                    <Badge variant="secondary">{t}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {problem.sourceUrl && <SourceLink url={problem.sourceUrl} />}
            <CollapsibleTrigger
              render={<Button variant="ghost" size="xs" className="data-panel-open:[&_svg]:rotate-180" />}
            >
              Statement <ChevronDownIcon className="transition-transform" />
            </CollapsibleTrigger>
          </div>
        </div>
        <ForkButton token={token} viewer={viewer} ownerSlug={ownerSlug} />
      </div>
      <CollapsibleContent>
        <pre className="mt-4 max-h-72 overflow-auto rounded-lg border bg-tile p-3 font-sans text-sm whitespace-pre-wrap">
          {problem.statement}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
