"use client";

import {
  BracketsIcon,
  CaseSensitiveIcon,
  CircleDotIcon,
  CircleIcon,
  Grid3x3Icon,
  KeyRoundIcon,
  LayersIcon,
  ListEndIcon,
  NetworkIcon,
  Share2Icon,
  SquareIcon,
  VariableIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { PALETTE_KINDS, PALETTE_LABELS, template, type PaletteKind } from "@/lib/sketch/templates";
import { insertElements } from "./commands";
import { PALETTE_MIME } from "./SketchCanvas";
import type { SketchStore } from "./store";

const ICONS: Record<PaletteKind, LucideIcon> = {
  array: BracketsIcon,
  string: CaseSensitiveIcon,
  matrix: Grid3x3Icon,
  hashmap: KeyRoundIcon,
  set: CircleDotIcon,
  stack: LayersIcon,
  queue: ListEndIcon,
  variables: VariableIcon,
  linkedList: WorkflowIcon,
  listNode: SquareIcon,
  tree: NetworkIcon,
  treeNode: CircleIcon,
  graphNode: Share2Icon,
};

function Item({ store, kind }: { store: SketchStore; kind: PaletteKind }) {
  const Icon = ICONS[kind];
  const { label, hint } = PALETTE_LABELS[kind];
  return (
    <li>
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PALETTE_MIME, kind);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => insertElements(store, template(kind))}
        title={`${hint}. Click to add, or drag onto the canvas.`}
        className="flex w-full cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:cursor-grabbing"
      >
        <Icon className="size-4 shrink-0 text-brand-strong" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

/** The elements to add: the ones this problem's signature and tags call for first, the rest under "More". */
export function Palette({ store, suggested }: { store: SketchStore; suggested: readonly PaletteKind[] }) {
  const rest = PALETTE_KINDS.filter((k) => !suggested.includes(k));
  return (
    <nav aria-label="Elements" className="flex flex-col gap-4">
      <section>
        <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">For this problem</h2>
        <ul>
          {suggested.map((k) => (
            <Item key={k} store={store} kind={k} />
          ))}
        </ul>
      </section>
      {rest.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">More</h2>
          <ul>
            {rest.map((k) => (
              <Item key={k} store={store} kind={k} />
            ))}
          </ul>
        </section>
      )}
    </nav>
  );
}
