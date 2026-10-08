"use client";

import type { StateOf, Step, Structure, StructureKind, StructureState } from "@/lib/ai/schemas/vizSpec";
import { decorationsFor } from "@/lib/viz/prepare";
import { ArrayView, StringView } from "./renderers/ArrayView";
import { GraphView } from "./renderers/GraphView";
import { HashMapView } from "./renderers/HashMapView";
import { LinkedListView } from "./renderers/LinkedListView";
import { MatrixView } from "./renderers/MatrixView";
import { QueueView } from "./renderers/QueueView";
import { SetView } from "./renderers/SetView";
import { StackView } from "./renderers/StackView";
import { TreeView } from "./renderers/TreeView";
import type { RendererProps } from "./renderers/types";
import { VariablesView } from "./renderers/VariablesView";

const RENDERERS: { [K in StructureKind]: (props: RendererProps<K>) => React.ReactNode } = {
  array: ArrayView,
  string: StringView,
  hashmap: HashMapView,
  set: SetView,
  stack: StackView,
  queue: QueueView,
  linkedList: LinkedListView,
  tree: TreeView,
  graph: GraphView,
  matrix: MatrixView,
  variables: VariablesView,
};

const KIND_LABEL: Record<StructureKind, string> = {
  array: "array",
  string: "string",
  hashmap: "hash map",
  set: "set",
  stack: "stack",
  queue: "queue",
  linkedList: "linked list",
  tree: "tree",
  graph: "graph",
  matrix: "matrix",
  variables: "",
};

export function StructureView({
  structure,
  step,
  prevStep,
  history,
}: {
  structure: Structure;
  step: Step;
  prevStep?: Step;
  history: StructureState[];
}) {
  const state = step.states[structure.id];
  const prev = prevStep?.states[structure.id];
  const Renderer = RENDERERS[structure.kind] as (props: RendererProps<StructureKind>) => React.ReactNode;

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border bg-tile p-3">
      <header className="flex items-baseline gap-2">
        <h3 className="font-mono text-sm font-medium">{structure.label}</h3>
        {KIND_LABEL[structure.kind] && (
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{KIND_LABEL[structure.kind]}</span>
        )}
      </header>
      <div className="overflow-x-auto pb-1">
        {state && state.kind === structure.kind ? (
          <Renderer
            structure={structure}
            state={state as StateOf<StructureKind>}
            prevState={prev?.kind === structure.kind ? (prev as StateOf<StructureKind>) : undefined}
            history={history.filter((h) => h.kind === structure.kind) as StateOf<StructureKind>[]}
            deco={decorationsFor(step, structure.id)}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">No state for this step.</p>
        )}
      </div>
    </section>
  );
}
