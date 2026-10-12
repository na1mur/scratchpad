import { MAX_STEPS, type Loop, type Step } from "@/lib/ai/schemas/vizSpec";

/**
 * Caps a run at MAX_STEPS. Iterations of the busiest loop in the middle of
 * the run are folded into one step each run of them ("…iterations 3–6
 * omitted"); if that's not enough, steps are thinned evenly.
 */
export function collapseSteps(steps: Step[], loops: Loop[]): Step[] {
  if (steps.length <= MAX_STEPS) return renumber(steps);

  const counts = new Map<string, Set<number>>();
  for (const s of steps) {
    if (!s.iteration) continue;
    const set = counts.get(s.iteration.loopId) ?? new Set<number>();
    set.add(s.iteration.index);
    counts.set(s.iteration.loopId, set);
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  let result = steps;

  if (busiest && busiest[1].size > 4) {
    const [loopId, indexSet] = busiest;
    const indexes = [...indexSet].sort((a, b) => a - b);
    const keep = new Set([...indexes.slice(0, 2), ...indexes.slice(-2)]);
    const label = loops.find((l) => l.id === loopId)?.label ?? loopId;
    result = [];
    let pending: Step[] = [];
    const flush = () => {
      if (!pending.length) return;
      const first = pending[0].iteration!.index;
      const last = pending[pending.length - 1].iteration!.index;
      const tail = pending[pending.length - 1];
      result.push({
        ...tail,
        title: `…iterations ${first + 1}–${last + 1} omitted`,
        explanation: `Iterations ${first + 1}–${last + 1} of ${label} follow the same pattern; this shows the state after them.`,
        isBugMoment: undefined,
      });
      pending = [];
    };
    for (const s of steps) {
      if (s.iteration?.loopId === loopId && !keep.has(s.iteration.index)) pending.push(s);
      else {
        flush();
        result.push(s);
      }
    }
    flush();
  }

  if (result.length > MAX_STEPS) {
    const stride = result.length / MAX_STEPS;
    const thinned: Step[] = [];
    for (let i = 0; i < MAX_STEPS - 1; i++) thinned.push(result[Math.floor(i * stride)]);
    thinned.push(result[result.length - 1]);
    result = thinned;
  }
  return renumber(result);
}

function renumber(steps: Step[]): Step[] {
  return steps.map((s, i) => ({ ...s, id: `s${i + 1}` }));
}
