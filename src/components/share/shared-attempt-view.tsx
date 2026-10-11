"use client";

import { useState } from "react";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import type { SharedViewer } from "@/components/share/fork-button";
import { SharedProblemHeader } from "@/components/share/shared-problem-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseBar, casesPassedText } from "@/components/viz/CaseBar";
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { HintsPanel } from "@/components/viz/HintsPanel";
import { Player } from "@/components/viz/Player";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { caseView } from "@/lib/ai/schemas/vizSpec";
import type { SharedAttempt } from "@/lib/shares";

/** Read-only view of a shared attempt: what the learner wrote and the run, without chat or history. */
export function SharedAttemptView({
  token,
  data,
  viewer,
}: {
  token: string;
  data: Pick<SharedAttempt, "problem" | "attempt" | "ownerSlug">;
  viewer: SharedViewer;
}) {
  const { problem, attempt } = data;
  const spec = attempt.vizSpec;
  const [index, setIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const [tab, setTab] = useState("viz");
  const shownCase = Math.min(caseIndex, spec.cases.length - 1);
  const jump = (ci: number, i: number) => {
    setCaseIndex(ci);
    setIndex(i);
    setTab("viz");
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SharedProblemHeader
        eyebrow="Shared pseudo-code"
        problem={problem}
        token={token}
        viewer={viewer}
        ownerSlug={data.ownerSlug}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="The attempt">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Pseudo-code</h2>
            <CodeEditor value={attempt.pseudoCode} onChange={() => {}} readOnly minLines={6} />
          </div>
          {attempt.idea.trim() && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Idea / explanation</h2>
              <p className="rounded-lg border bg-tile p-3 text-sm whitespace-pre-wrap">{attempt.idea}</p>
            </div>
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-3" aria-label="The run">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={spec.summary.verdict} />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">{casesPassedText(spec)}</p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="viz">Visualization</TabsTrigger>
              <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
              <TabsTrigger value="hints">Hints</TabsTrigger>
            </TabsList>
            <TabsContent value="viz" className="flex flex-col gap-3 pt-3">
              <CaseBar spec={spec} caseIndex={shownCase} onCaseChange={(ci) => jump(ci, 0)} gives="Their code gives" />
              <Player
                key={shownCase}
                spec={caseView(spec, shownCase)}
                language={problem.language}
                index={index}
                onIndexChange={setIndex}
                layoutId="shared"
              />
            </TabsContent>
            <TabsContent value="diagnosis" className="pt-3">
              <DiagnosisPanel spec={spec} onJumpToStep={jump} />
            </TabsContent>
            <TabsContent value="hints" className="pt-3">
              <HintsPanel spec={spec} onJumpToStep={jump} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}
