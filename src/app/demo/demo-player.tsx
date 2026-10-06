"use client";

import { useState } from "react";
import { cn } from "cn";
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { Player } from "@/components/viz/Player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatSpecIssues, vizSpecSchema } from "@/lib/ai/schemas/vizSpec";
import { FIXTURES } from "@/lib/viz/fixtures";

const built = FIXTURES.map((f) => {
  const spec = f.build();
  const check = vizSpecSchema.safeParse(spec);
  return { ...f, spec, issues: check.success ? null : formatSpecIssues(check.error) };
});

export function DemoPlayer() {
  const [fixtureId, setFixtureId] = useState(built[0].id);
  const [index, setIndex] = useState(0);
  const fixture = built.find((f) => f.id === fixtureId) ?? built[0];

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
              setIndex(0);
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
        </TabsList>
        <TabsContent value="run" className="pt-3">
          <Player key={fixture.id} spec={fixture.spec} index={index} onIndexChange={setIndex} layoutId={fixture.id} />
        </TabsContent>
        <TabsContent value="diagnosis" className="pt-3">
          <DiagnosisPanel key={fixture.id} spec={fixture.spec} onJumpToStep={setIndex} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
