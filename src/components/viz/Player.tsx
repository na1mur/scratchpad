"use client";

import { useEffect, useState } from "react";
import { LayoutGroup } from "motion/react";
import {
  CheckIcon,
  ChevronFirstIcon,
  MessageCircleQuestionIcon,
  ChevronLastIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { bugStepIndexes, iterationStarts, withStableIds } from "@/lib/viz/prepare";
import { CodePane } from "./CodePane";
import { ExplanationPanel } from "./ExplanationPanel";
import { StructureView } from "./StructureView";
import { Timeline } from "./Timeline";

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const speedItems = SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }));
const BASE_DELAY_MS = 1400;

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox";
}

export function Player({
  spec,
  index,
  onIndexChange,
  selectedStepIds,
  onToggleStepSelect,
  layoutId = "player",
}: {
  spec: VizSpec;
  index: number;
  onIndexChange: (index: number) => void;
  selectedStepIds?: Set<string>;
  onToggleStepSelect?: (stepId: string) => void;
  /** Namespaces shared-layout animations when several players exist. */
  layoutId?: string;
}) {
  const prepared = withStableIds(spec);
  const steps = prepared.steps;
  const last = steps.length - 1;
  const current = Math.min(Math.max(index, 0), last);
  const step = steps[current];
  const bugs = bugStepIndexes(prepared);
  const iterStarts = iterationStarts(prepared);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  const iterationCounts = new Map<string, number>();
  for (const s of steps) {
    if (s.iteration) {
      iterationCounts.set(s.iteration.loopId, Math.max(iterationCounts.get(s.iteration.loopId) ?? 0, s.iteration.index + 1));
    }
  }
  const histories = new Map(prepared.structures.map((st) => [st.id, steps.map((s) => s.states[st.id]).filter(Boolean)]));

  const seek = (i: number) => onIndexChange(Math.min(Math.max(i, 0), last));
  const togglePlay = () => {
    if (!playing && current >= last) seek(0);
    setPlaying(!playing);
  };

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (current >= last) setPlaying(false);
      else onIndexChange(current + 1);
    }, BASE_DELAY_MS / speed);
    return () => clearTimeout(t);
  }, [playing, current, last, speed, onIndexChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        onIndexChange(Math.min(current + 1, last));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        onIndexChange(Math.max(current - 1, 0));
      } else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (current >= last && !playing) onIndexChange(0);
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, last, playing, onIndexChange]);

  return (
    <LayoutGroup id={layoutId}>
      <div className="@container flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label="First step" onClick={() => (setPlaying(false), seek(0))} disabled={current === 0}>
            <ChevronFirstIcon />
          </IconButton>
          <IconButton label="Previous step (←)" onClick={() => (setPlaying(false), seek(current - 1))} disabled={current === 0}>
            <SkipBackIcon />
          </IconButton>
          <Button size="icon" onClick={togglePlay} aria-label={playing ? "Pause (space)" : "Play (space)"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <IconButton label="Next step (→)" onClick={() => (setPlaying(false), seek(current + 1))} disabled={current === last}>
            <SkipForwardIcon />
          </IconButton>
          <IconButton label="Last step" onClick={() => (setPlaying(false), seek(last))} disabled={current === last}>
            <ChevronLastIcon />
          </IconButton>
          <Select items={speedItems} value={String(speed)} onValueChange={(v) => v && setSpeed(Number(v))}>
            <SelectTrigger size="sm" className="ml-1 w-20" aria-label="Playback speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {speedItems.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {current + 1} / {steps.length}
          </span>
        </div>

        <Timeline
          steps={steps}
          current={current}
          onSeek={(i) => (setPlaying(false), seek(i))}
          bugIndexes={bugs}
          iterationStarts={iterStarts}
          selected={selectedStepIds}
          onToggleSelect={onToggleStepSelect}
        />

        <ExplanationPanel
          step={step}
          index={current}
          total={steps.length}
          loops={prepared.loops}
          iterationCounts={iterationCounts}
          isBug={bugs.has(current)}
          action={
            onToggleStepSelect && (
              <Button variant="ghost" size="xs" onClick={() => onToggleStepSelect(step.id)}>
                {selectedStepIds?.has(step.id) ? <CheckIcon /> : <MessageCircleQuestionIcon />}
                {selectedStepIds?.has(step.id) ? "Selected to ask" : "Ask about this step"}
              </Button>
            )
          }
        />

        <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <CodePane
            lines={prepared.codeLines}
            addedLines={prepared.addedLines}
            activeLine={step.line}
            isBug={bugs.has(current)}
            className="max-h-72 @3xl:max-h-[32rem]"
          />
          <div className="flex min-w-0 flex-col gap-3">
            {prepared.structures.map((st) => (
              <StructureView
                key={st.id}
                structure={st}
                step={step}
                prevStep={current > 0 ? steps[current - 1] : undefined}
                history={histories.get(st.id) ?? []}
              />
            ))}
          </div>
        </div>
      </div>
    </LayoutGroup>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
