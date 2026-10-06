import type { Step } from "@/lib/ai/schemas/vizSpec";

/** Tiny helper for writing fixture specs by hand: numbers the step ids. */
export function recorder() {
  const steps: Step[] = [];
  return {
    steps,
    add(step: Omit<Step, "id">): string {
      const id = `s${steps.length + 1}`;
      steps.push({ id, ...step });
      return id;
    },
  };
}
