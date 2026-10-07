"use client";

import { Fragment } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightIcon, Redo2Icon } from "lucide-react";
import { cn } from "cn";
import type { StateOf } from "@/lib/ai/schemas/vizSpec";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";
import { PointerLabels } from "./SequenceView";
import type { RendererProps } from "./types";

type ListNode = StateOf<"linkedList">["nodes"][number];

/** Orders nodes along `next` from the head; detached nodes trail behind. */
function chains(state: StateOf<"linkedList">): { chain: ListNode[]; cycleTo: string | null }[] {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const pointedTo = new Set(state.nodes.map((n) => n.next).filter(Boolean));
  const starts = [
    ...(state.headId && byId.has(state.headId) ? [state.headId] : []),
    ...state.nodes.filter((n) => !pointedTo.has(n.id) && n.id !== state.headId).map((n) => n.id),
  ];
  const seen = new Set<string>();
  const out: { chain: ListNode[]; cycleTo: string | null }[] = [];
  const walk = (start: string) => {
    const chain: ListNode[] = [];
    let cur: string | null = start;
    let cycleTo: string | null = null;
    while (cur && byId.has(cur)) {
      if (seen.has(cur)) {
        cycleTo = cur;
        break;
      }
      seen.add(cur);
      chain.push(byId.get(cur)!);
      cur = byId.get(cur)!.next;
    }
    if (chain.length) out.push({ chain, cycleTo });
  };
  starts.forEach(walk);
  // Pure cycles have no unreferenced start node.
  state.nodes.forEach((n) => !seen.has(n.id) && walk(n.id));
  return out;
}

export function LinkedListView({ state, prevState, deco }: RendererProps<"linkedList">) {
  const prev = new Map(prevState?.nodes.map((n) => [n.id, n]));
  const groups = chains(state);
  if (groups.length === 0) return <p className="text-sm text-muted-foreground italic">empty list</p>;

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ chain, cycleTo }, gi) => (
        <div key={chain[0].id} className={cn("flex items-end gap-1", gi > 0 && "opacity-70")}>
          <AnimatePresence initial={false} mode="popLayout">
            {chain.map((node, i) => {
              const tone = deco.tones.get(node.id);
              const pointers = deco.pointers.filter((p) => String(p.index) === node.id);
              const before = prev.get(node.id);
              const relinked = before !== undefined && before.next !== node.next;
              return (
                <Fragment key={node.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={SPRING}
                    className="flex flex-col items-center gap-1"
                  >
                    <PointerLabels pointers={pointers} />
                    <div
                      className={cn(
                        "flex h-10 min-w-10 items-center justify-center rounded-full border px-3 font-mono text-sm transition-colors duration-300",
                        tone ? TONE_BOX[tone] : NEUTRAL_BOX,
                      )}
                    >
                      {formatValue(node.value)}
                    </div>
                    <span className="h-3" />
                  </motion.div>
                  {(i < chain.length - 1 || node.next === null || cycleTo) && (
                    <motion.div layout transition={SPRING} className="mb-7 flex items-center">
                      {i < chain.length - 1 ? (
                        <ArrowRightIcon
                          className={cn("size-4 text-muted-foreground", relinked && "text-viz-active")}
                        />
                      ) : cycleTo ? (
                        <span className="flex items-center gap-0.5 text-xs text-viz-error">
                          <Redo2Icon className="size-3.5" /> back to {formatValue(state.nodes.find((n) => n.id === cycleTo)?.value)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRightIcon className="size-4" /> null
                        </span>
                      )}
                    </motion.div>
                  )}
                </Fragment>
              );
            })}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
