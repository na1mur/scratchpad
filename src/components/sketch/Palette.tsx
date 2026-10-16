"use client";

import { useId, useState } from "react";
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  BetweenHorizontalStartIcon,
  BracketsIcon,
  CaseSensitiveIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  CircleSlash2Icon,
  Columns3Icon,
  CornerDownLeftIcon,
  CornerDownRightIcon,
  Grid3x3Icon,
  KeyRoundIcon,
  LayersIcon,
  ListEndIcon,
  ListPlusIcon,
  MoveRightIcon,
  NetworkIcon,
  PlusIcon,
  Rows3Icon,
  Share2Icon,
  VariableIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PART_GROUPS, isPointerPart, type Part, type PartGroup, type PartIcon } from "@/lib/sketch/parts";
import type { PaletteKind } from "@/lib/sketch/templates";
import { PALETTE_PART_MIME, runPart, setDraggedPart } from "./partCommands";
import type { SketchStore } from "./store";

const KIND_ICONS: Record<PaletteKind, LucideIcon> = {
  array: BracketsIcon,
  string: CaseSensitiveIcon,
  matrix: Grid3x3Icon,
  hashmap: KeyRoundIcon,
  set: CircleDotIcon,
  stack: LayersIcon,
  queue: ListEndIcon,
  variables: VariableIcon,
  linkedList: WorkflowIcon,
  listNode: CircleIcon,
  tree: NetworkIcon,
  treeNode: CircleIcon,
  graphNode: Share2Icon,
};

const PART_ICONS: Record<Exclude<PartIcon, "whole">, LucideIcon> = {
  listNode: CircleIcon,
  treeNode: CircleIcon,
  leftChild: CornerDownLeftIcon,
  rightChild: CornerDownRightIcon,
  null: CircleSlash2Icon,
  link: MoveRightIcon,
  cell: BetweenHorizontalStartIcon,
  push: ArrowDownToLineIcon,
  pop: ArrowUpFromLineIcon,
  entry: ListPlusIcon,
  row: Rows3Icon,
  column: Columns3Icon,
};

const dragProps = (part: Part) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(PALETTE_PART_MIME, part.id);
    e.dataTransfer.effectAllowed = "copy";
    setDraggedPart(part.id);
  },
  onDragEnd: () => setDraggedPart(null),
});

function PartRow({ store, part, kind }: { store: SketchStore; part: Part; kind: PaletteKind }) {
  const Icon = part.icon === "whole" ? KIND_ICONS[kind] : PART_ICONS[part.icon];
  return (
    <li>
      <button
        type="button"
        {...dragProps(part)}
        onClick={() => runPart(store, part)}
        title={`${part.hint}. Click to add, or drag onto the canvas.`}
        className="group/part flex w-full cursor-grab items-center gap-2 rounded-md py-1 pr-1 pl-2 text-left text-[13px] hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:cursor-grabbing"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="sr-only">Add </span>
          {part.label}
        </span>
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-md border text-muted-foreground group-hover/part:border-brand group-hover/part:bg-brand group-hover/part:text-brand-foreground group-focus-visible/part:border-brand group-focus-visible/part:bg-brand group-focus-visible/part:text-brand-foreground"
        >
          <PlusIcon className="size-3" />
        </span>
      </button>
    </li>
  );
}

function PointerChips({ store, parts }: { store: SketchStore; parts: Part[] }) {
  const id = useId();
  return (
    <li className="px-2 pt-1 pb-1.5">
      <span id={id} className="text-[11px] text-muted-foreground">
        Pointers
      </span>
      <div role="group" aria-labelledby={id} className="mt-1 flex flex-wrap gap-1">
        {parts.map((part) => (
          <button
            key={part.id}
            type="button"
            {...dragProps(part)}
            onClick={() => runPart(store, part)}
            aria-label={`Add pointer ${part.label}`}
            title={`${part.hint}. Click to add, or drag onto a node or cell.`}
            className="inline-flex cursor-grab items-center gap-0.5 rounded-full border border-pen-blue/40 py-0.5 pr-1.5 pl-1 font-mono text-xs text-pen-blue hover:bg-pen-blue hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:cursor-grabbing dark:hover:text-paper"
          >
            <PlusIcon className="size-3" aria-hidden />
            {part.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function Group({ store, group, open, onToggle }: { store: SketchStore; group: PartGroup; open: boolean; onToggle: () => void }) {
  const id = useId();
  const Icon = KIND_ICONS[group.kind];
  const rows = group.parts.filter((p) => !isPointerPart(p));
  const pointers = group.parts.filter(isPointerPart);
  return (
    <li>
      <button
        type="button"
        {...dragProps(group.parts[0])}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        title={`${group.hint}. Drag onto the canvas to add one.`}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        <Icon className="size-4 shrink-0 text-brand-strong" aria-hidden />
        <span className="truncate">{group.label}</span>
      </button>
      {open && (
        <ul id={id} className="mb-1 ml-3 border-l pl-1">
          {rows.map((part) => (
            <PartRow key={part.id} store={store} part={part} kind={group.kind} />
          ))}
          {pointers.length > 0 && <PointerChips store={store} parts={pointers} />}
        </ul>
      )}
    </li>
  );
}

/**
 * The elements to add, the ones this problem's signature and tags call for first and the rest under "More".
 * Each opens into its parts (a node, `head`, push…): clicking one attaches it to what's selected, or to the only
 * structure it fits, and dragging one drops it onto a node or cell.
 */
export function Palette({ store, suggested }: { store: SketchStore; suggested: readonly PaletteKind[] }) {
  const first = PART_GROUPS.filter((g) => suggested.includes(g.kind));
  const rest = PART_GROUPS.filter((g) => !suggested.includes(g.kind));
  // Every group starts closed; the lists are long and the learner opens what they need.
  const [open, setOpen] = useState(() => new Set<PaletteKind>());
  const toggle = (kind: PaletteKind) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const list = (groups: readonly PartGroup[]) => (
    <ul>
      {groups.map((g) => (
        <Group key={g.kind} store={store} group={g} open={open.has(g.kind)} onToggle={() => toggle(g.kind)} />
      ))}
    </ul>
  );

  return (
    <nav aria-label="Elements" className="flex flex-col gap-4">
      {first.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">For this problem</h2>
          {list(first)}
        </section>
      )}
      {rest.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">More</h2>
          {list(rest)}
        </section>
      )}
      <p className="px-2 text-[11px] leading-4 text-muted-foreground text-pretty">
        Select a node or cell first to add a part to it, or drag the part onto it.
      </p>
    </nav>
  );
}
