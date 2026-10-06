"use client";

import type { Scalar } from "@/lib/ai/schemas/vizSpec";
import { SequenceView } from "./SequenceView";
import type { RendererProps } from "./types";

function prevMap(prev?: { values: Scalar[]; ids?: string[] }) {
  const m = new Map<string, Scalar>();
  prev?.values.forEach((v, i) => m.set(prev.ids?.[i] ?? `idx-${i}`, v));
  return m;
}

export function ArrayView({ state, prevState, deco }: RendererProps<"array">) {
  return (
    <SequenceView
      variant="array"
      values={state.values}
      ids={state.ids ?? state.values.map((_, i) => `idx-${i}`)}
      prevById={prevMap(prevState)}
      deco={deco}
    />
  );
}

export function StringView({ state, prevState, deco }: RendererProps<"string">) {
  return (
    <SequenceView
      variant="string"
      values={state.values}
      ids={state.ids ?? state.values.map((_, i) => `idx-${i}`)}
      prevById={prevMap(prevState)}
      deco={deco}
    />
  );
}
