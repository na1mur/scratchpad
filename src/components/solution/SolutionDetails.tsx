"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ChevronDownIcon, CopyIcon, CpuIcon, GitBranchIcon, GlobeIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseBar } from "@/components/viz/CaseBar";
import { CodePane } from "@/components/viz/CodePane";
import { Player } from "@/components/viz/Player";
import {
  SOLUTION_REQUEST_LABELS,
  buildsOnAttempt,
  type SolutionContent,
  type SolutionRequestKind,
} from "@/lib/ai/schemas/solution";
import { caseView, stepAt, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { languageLabel } from "@/lib/languages";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/providers";
import { LineBreakdown } from "./LineBreakdown";
import { StepOutline } from "./StepOutline";

/**
 * The approach and code of one solution version. On a public page (`origin` absent) the parts addressed to
 * the learner ("from your attempt") are left out.
 */
export function SolutionApproach({
  content,
  language,
  model,
  activeLine,
  origin,
}: {
  content: SolutionContent;
  language: string;
  model: { provider: ProviderId; model: string } | null;
  activeLine: number | null;
  origin?: { requestKind: SolutionRequestKind; requestNote: string; basedOnAttemptVersion: number | null };
}) {
  return (
    <>
      <section className="flex flex-col gap-3" aria-label="Approach" data-tour="approach">
        <div>
          {origin && (
            <p className="text-xs text-muted-foreground">
              {SOLUTION_REQUEST_LABELS[origin.requestKind]}
              {buildsOnAttempt(origin.requestKind) && origin.basedOnAttemptVersion
                ? ` v${origin.basedOnAttemptVersion}`
                : origin.requestNote
                  ? `: ${origin.requestNote}`
                  : ""}
            </p>
          )}
          <h2 className="text-lg font-semibold tracking-tight">{content.name}</h2>
          {model && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <CpuIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                Written by {PROVIDER_LABELS[model.provider]} · <span className="font-mono">{model.model}</span>
              </span>
            </p>
          )}
        </div>
        <dl className="flex flex-wrap gap-2 text-sm">
          <div className="flex items-center gap-1.5 rounded-full border bg-tile px-3 py-1">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="font-mono font-medium">{content.complexity.time}</dd>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border bg-tile px-3 py-1">
            <dt className="text-muted-foreground">Space</dt>
            <dd className="font-mono font-medium">{content.complexity.space}</dd>
          </div>
        </dl>
        <p className="text-sm">{content.summary}</p>
        {origin && content.relationToAttempt && (
          <div className="flex gap-2 rounded-lg border border-brand bg-brand-soft p-3 text-sm">
            <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
            <div>
              <p className="font-medium">
                {buildsOnAttempt(origin.requestKind)
                  ? `From your attempt${origin.basedOnAttemptVersion ? ` v${origin.basedOnAttemptVersion}` : ""}`
                  : "Compared with your other solutions"}
              </p>
              <p className="text-muted-foreground">{content.relationToAttempt}</p>
            </div>
          </div>
        )}
        {content.keyIdeas.length > 0 && (
          <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <LightbulbIcon className="size-4 text-brand-strong" aria-hidden /> Key ideas
            </h3>
            <ol className="flex list-inside list-decimal flex-col gap-1 text-sm text-muted-foreground marker:text-brand-strong">
              {content.keyIdeas.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ol>
          </div>
        )}
        <div>
          <h3 className="mb-1 text-sm font-medium">Why it works</h3>
          <p className="text-sm text-muted-foreground">{content.whyItWorks}</p>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-medium">Complexity</h3>
          <p className="text-sm text-muted-foreground">{content.complexity.explanation}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Code" data-tour="code">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            Code <span className="font-normal text-muted-foreground">· {languageLabel(language)}</span>
          </h3>
          <CopyCodeButton code={content.codeLines.join("\n")} />
        </div>
        <CodePane lines={content.codeLines} language={language} activeLine={activeLine} className="max-h-[28rem]" />
        {!content.verified && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-viz-error" aria-hidden />
            When this code was run on the test input, its result didn&apos;t match the expected one. The problem may
            accept several answers, but double-check it{origin ? ", or ask about it in the chat" : ""}.
          </p>
        )}
        {content.references?.length ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <GlobeIcon className="mt-0.5 size-3.5 shrink-0 text-brand-strong" aria-hidden />
            <span>
              Written with reference to{" "}
              {content.references.map((r, i) => (
                <span key={r.url}>
                  {i > 0 && ", "}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {r.title}
                  </a>
                  {r.license && ` (${r.license})`}
                </span>
              ))}
              .
            </span>
          </p>
        ) : null}
      </section>
    </>
  );
}

/** Input and result of the walkthrough, then the step player and the line-by-line breakdown. */
export function SolutionWalkthrough({
  layoutId,
  spec,
  content,
  language,
  caseIndex,
  onCaseChange,
  playerIndex,
  onIndexChange,
  tab,
  onTabChange,
  selectedStepIds,
  onToggleStep,
  badge,
}: {
  layoutId: string;
  spec: VizSpec;
  content: SolutionContent;
  language: string;
  /** Which test case the walkthrough shows. */
  caseIndex: number;
  onCaseChange: (index: number) => void;
  playerIndex: number;
  onIndexChange: (index: number) => void;
  tab: string;
  onTabChange: (tab: string) => void;
  selectedStepIds?: string[];
  onToggleStep?: (stepId: string) => void;
  /** Shown at the end of the input row (the owner's usage badge). */
  badge?: React.ReactNode;
}) {
  const shownCase = Math.min(caseIndex, spec.cases.length - 1);
  const view = caseView(spec, shownCase);
  const currentLine = stepAt(spec, shownCase, playerIndex)?.line ?? null;
  return (
    <>
      <div data-tour="cases">
        <CaseBar
          spec={spec}
          caseIndex={shownCase}
          onCaseChange={(ci) => {
            onCaseChange(ci);
            onIndexChange(0);
          }}
          gives="Returns"
          trailing={badge}
        />
      </div>
      <Tabs value={tab} onValueChange={(v) => onTabChange(String(v))}>
        <TabsList data-tour="tabs">
          <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
          <TabsTrigger value="lines">Line by line</TabsTrigger>
        </TabsList>
        <TabsContent value="walkthrough" className="flex flex-col gap-4 pt-3">
          <Player
            key={`${layoutId}-${shownCase}`}
            spec={view}
            language={language}
            index={playerIndex}
            onIndexChange={onIndexChange}
            layoutId={layoutId}
            selectedStepIds={selectedStepIds && new Set(selectedStepIds)}
            onToggleStepSelect={onToggleStep}
            skipControls
          />
          <Collapsible defaultOpen={view.loops.length > 0}>
            <CollapsibleTrigger
              render={<Button variant="ghost" size="sm" className="-ml-2 data-panel-open:[&_svg]:rotate-180" />}
            >
              Every step, grouped by loop iteration <ChevronDownIcon className="transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <StepOutline spec={view} current={playerIndex} onSeek={onIndexChange} />
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
        <TabsContent value="lines" className="pt-3">
          <LineBreakdown
            content={content}
            language={language}
            spec={view}
            activeLine={currentLine}
            onJumpToStep={(i) => {
              onIndexChange(i);
              onTabChange("walkthrough");
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() =>
        navigator.clipboard.writeText(code).then(
          () => setCopied(true),
          () => toast.error("Couldn't copy."),
        )
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}
