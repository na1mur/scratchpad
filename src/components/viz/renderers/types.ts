import type { StateOf, Structure, StructureKind } from "@/lib/ai/schemas/vizSpec";
import type { StepDecorations } from "@/lib/viz/prepare";

export type RendererProps<K extends StructureKind> = {
  structure: Structure;
  state: StateOf<K>;
  /** The same structure one step earlier, for change flashes. */
  prevState?: StateOf<K>;
  /** Every state of this structure across the run, for stable layouts. */
  history: StateOf<K>[];
  deco: StepDecorations;
};
