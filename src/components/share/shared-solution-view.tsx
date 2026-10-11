"use client";

import { useState } from "react";
import type { SharedViewer } from "@/components/share/fork-button";
import { SharedProblemHeader } from "@/components/share/shared-problem-header";
import { SolutionApproach, SolutionWalkthrough } from "@/components/solution/SolutionDetails";
import { stepAt } from "@/lib/ai/schemas/vizSpec";
import type { SharedSolution } from "@/lib/shares";

/** Read-only view of one shared solution version: approach, code and walkthrough, without chat. */
export function SharedSolutionView({
  token,
  data,
  viewer,
}: {
  token: string;
  data: Pick<SharedSolution, "problem" | "solution" | "ownerSlug">;
  viewer: SharedViewer;
}) {
  const { problem, solution } = data;
  const [index, setIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const [tab, setTab] = useState("walkthrough");
  const spec = solution.vizSpec;
  const currentLine = stepAt(spec, caseIndex, index)?.line ?? null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SharedProblemHeader
        eyebrow="Shared solution"
        problem={problem}
        token={token}
        viewer={viewer}
        ownerSlug={data.ownerSlug}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SolutionApproach
            content={solution.content}
            language={solution.language}
            model={solution.model}
            activeLine={tab === "walkthrough" ? currentLine : null}
          />
        </div>
        <section className="flex min-w-0 flex-col gap-3" aria-label="Walkthrough">
          <SolutionWalkthrough
            layoutId="shared"
            spec={spec}
            content={solution.content}
            language={solution.language}
            caseIndex={caseIndex}
            onCaseChange={setCaseIndex}
            playerIndex={index}
            onIndexChange={setIndex}
            tab={tab}
            onTabChange={setTab}
          />
        </section>
      </div>
    </main>
  );
}
