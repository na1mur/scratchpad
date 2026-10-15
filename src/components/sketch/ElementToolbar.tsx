"use client";

import { CopyIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addChild, addEntry, addNextNode, insertCell, removeCell, removeEntry, resizeMatrix } from "@/lib/sketch/actions";
import { elementBounds, linkSegment, pointerLabelRect } from "@/lib/sketch/layout";
import { MAX_CELLS, MAX_ENTRIES, MAX_MATRIX, isCells, isTable, type SketchElement } from "@/lib/sketch/types";
import { deleteSelection, duplicateSelection } from "./commands";
import { useSketch, type SketchStore } from "./store";

function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="xs" onClick={onClick} disabled={disabled} title={label}>
      {children}
    </Button>
  );
}

/** Edits for the one selected element, floating above it: add and remove cells, entries and children, copy, delete. */
export function ElementToolbar({ store, element: el }: { store: SketchStore; element: SketchElement }) {
  const { camera, activeCell, elements } = useSketch(store);
  // A link has no box: its toolbar sits above the middle of its line.
  const seg = el.type === "link" ? linkSegment(elements, el) : null;
  const bounds = seg
    ? { x: (seg.from.x + seg.to.x) / 2 - 12, y: (seg.from.y + seg.to.y) / 2 - 8, w: 0, h: 0 }
    : el.type === "pointer"
      ? pointerLabelRect(el)
      : elementBounds(el);
  if (!bounds) return null;
  const left = Math.max(8, (bounds.x + camera.x) * camera.zoom);
  const top = Math.max(8, (bounds.y + camera.y) * camera.zoom - 44);
  const active = activeCell?.elementId === el.id ? activeCell.index : null;

  const actions: React.ReactNode[] = [];
  if (isCells(el)) {
    const n = el.values.length;
    const full = n >= MAX_CELLS;
    if (el.type === "stack") {
      actions.push(
        <Action key="push" label="Push a value on top" disabled={full} onClick={() => store.commit(insertCell(el, n))}>
          <PlusIcon /> Push
        </Action>,
        <Action key="pop" label="Pop the top value" disabled={!n} onClick={() => store.commit(removeCell(el, n - 1))}>
          <MinusIcon /> Pop
        </Action>,
      );
    } else if (el.type === "queue") {
      actions.push(
        <Action key="enq" label="Add a value at the back" disabled={full} onClick={() => store.commit(insertCell(el, n))}>
          <PlusIcon /> Enqueue
        </Action>,
        <Action key="deq" label="Take the value at the front" disabled={!n} onClick={() => store.commit(removeCell(el, 0))}>
          <MinusIcon /> Dequeue
        </Action>,
      );
    } else {
      const at = active ?? n;
      actions.push(
        <Action
          key="ins"
          label={active === null ? "Add a cell at the end" : `Insert a cell before index ${active}`}
          disabled={full}
          onClick={() => {
            store.commit(insertCell(el, at));
            store.setActiveCell({ elementId: el.id, index: Math.min(at, n) });
          }}
        >
          <PlusIcon /> Cell
        </Action>,
        <Action
          key="rem"
          label={active === null ? "Remove the last cell" : `Remove the cell at index ${active}`}
          disabled={!n}
          onClick={() => {
            const i = active ?? n - 1;
            store.commit(removeCell(el, i));
            store.setActiveCell(n > 1 ? { elementId: el.id, index: Math.min(i, n - 2) } : null);
          }}
        >
          <MinusIcon /> Cell
        </Action>,
      );
    }
  } else if (isTable(el)) {
    const noun = el.type === "variables" ? "variable" : "entry";
    actions.push(
      <Action key="add" label={`Add ${noun === "entry" ? "an entry" : "a variable"}`} disabled={el.entries.length >= MAX_ENTRIES} onClick={() => store.commit(addEntry(el))}>
        <PlusIcon /> {noun === "entry" ? "Entry" : "Variable"}
      </Action>,
      <Action key="rem" label={`Remove the last ${noun}`} disabled={!el.entries.length} onClick={() => store.commit(removeEntry(elements, el, el.entries.length - 1))}>
        <MinusIcon /> {noun === "entry" ? "Entry" : "Variable"}
      </Action>,
    );
  } else if (el.type === "matrix") {
    const rows = el.rows.length;
    const cols = el.rows[0].length;
    actions.push(
      <Action key="r+" label="Add a row" disabled={rows >= MAX_MATRIX} onClick={() => store.commit(resizeMatrix(el, rows + 1, cols))}>
        <PlusIcon /> Row
      </Action>,
      <Action key="r-" label="Remove the last row" disabled={rows <= 1} onClick={() => store.commit(resizeMatrix(el, rows - 1, cols))}>
        <MinusIcon /> Row
      </Action>,
      <Action key="c+" label="Add a column" disabled={cols >= MAX_MATRIX} onClick={() => store.commit(resizeMatrix(el, rows, cols + 1))}>
        <PlusIcon /> Col
      </Action>,
      <Action key="c-" label="Remove the last column" disabled={cols <= 1} onClick={() => store.commit(resizeMatrix(el, rows, cols - 1))}>
        <MinusIcon /> Col
      </Action>,
    );
  } else if (el.type === "node") {
    const add = (side: "left" | "right" | "edge") => {
      const made = addChild(elements, el, side, store.lastKey);
      if (made) store.commit(made.changes, { select: [made.created] });
    };
    if (el.variant === "list") {
      actions.push(
        <Action
          key="next"
          label="Add a node after this one"
          onClick={() => {
            const made = addNextNode(elements, el, store.lastKey);
            store.commit(made.changes, { select: [made.created] });
          }}
        >
          <PlusIcon /> Next node
        </Action>,
      );
    } else if (el.variant === "tree") {
      actions.push(
        <Action key="l" label="Add a left child" onClick={() => add("left")}>
          <PlusIcon /> Left
        </Action>,
        <Action key="r" label="Add a right child" onClick={() => add("right")}>
          <PlusIcon /> Right
        </Action>,
      );
    } else {
      actions.push(
        <Action key="n" label="Add a neighbour" onClick={() => add("edge")}>
          <PlusIcon /> Neighbour
        </Action>,
      );
    }
  }
  // Text size, colours and the rest of the look are in the style panel (StylePanel.tsx).

  return (
    <div
      role="toolbar"
      aria-label="Element actions"
      className="absolute z-20 flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {actions}
      {actions.length > 0 && <span className="mx-0.5 h-4 w-px bg-border" />}
      {/* A link is copied with its nodes, not alone. */}
      {el.type !== "link" && (
        <Button variant="ghost" size="icon-xs" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={() => duplicateSelection(store)}>
          <CopyIcon />
        </Button>
      )}
      <Button variant="ghost" size="icon-xs" title="Delete (Del)" aria-label="Delete" onClick={() => deleteSelection(store)}>
        <Trash2Icon />
      </Button>
    </div>
  );
}
