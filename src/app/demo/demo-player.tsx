"use client";

import { useState } from "react";
import { cn } from "cn";
import { CaseBar } from "@/components/viz/CaseBar";
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { HintsPanel } from "@/components/viz/HintsPanel";
import { Player } from "@/components/viz/Player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { caseView, formatSpecIssues, upgradeSpec, vizSpecSchema } from "@/lib/ai/schemas/vizSpec";
import { FIXTURES } from "@/lib/viz/fixtures";

const built = FIXTURES.map((f) => {
  // Most fixtures are written as single-input (v1) specs.
  const spec = upgradeSpec(f.build());
  const check = vizSpecSchema.safeParse(spec);
  return { ...f, spec, issues: check.success ? null : formatSpecIssues(check.error) };
});

export function DemoPlayer() {
  const [fixtureId, setFixtureId] = useState(built[0].id);
  const [index, setIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const fixture = built.find((f) => f.id === fixtureId) ?? built[0];
  const jump = (ci: number, i: number) => {
    setCaseIndex(ci);
    setIndex(i);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Examples">
        {built.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={f.id === fixtureId}
            onClick={() => {
              setFixtureId(f.id);
              jump(0, 0);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
              f.id === fixtureId
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {fixture.issues && (
        <pre className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs whitespace-pre-wrap text-destructive">
          Fixture fails schema validation:{"\n"}
          {fixture.issues}
        </pre>
      )}

      <Tabs defaultValue="run">
        <TabsList>
          <TabsTrigger value="run">Run</TabsTrigger>
          <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
          <TabsTrigger value="hints">Hints</TabsTrigger>
        </TabsList>
        <TabsContent value="run" className="flex flex-col gap-3 pt-3">
          <CaseBar spec={fixture.spec} caseIndex={caseIndex} onCaseChange={(ci) => jump(ci, 0)} gives="Your code gives" />
          <Player
            key={`${fixture.id}-${caseIndex}`}
            spec={caseView(fixture.spec, caseIndex)}
            index={index}
            onIndexChange={setIndex}
            layoutId={fixture.id}
          />
        </TabsContent>
        <TabsContent value="diagnosis" className="pt-3">
          <DiagnosisPanel key={fixture.id} spec={fixture.spec} onJumpToStep={jump} />
        </TabsContent>
        <TabsContent value="hints" className="pt-3">
          <HintsPanel key={fixture.id} spec={fixture.spec} onJumpToStep={jump} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
