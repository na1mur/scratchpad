"use client";

import { toast } from "sonner";
import { applyPart, partById, type Part, type PartDrop } from "@/lib/sketch/parts";
import { insertElements } from "./commands";
import type { SketchStore } from "./store";

/** The drag type of a palette part (a whole item uses PALETTE_MIME). */
export const PALETTE_PART_MIME = "application/x-scratchpad-sketch-part";

/**
 * The part being dragged from the palette. A drag only exposes its data on drop, so the canvas reads this to
 * highlight where the part would attach while it's dragged over.
 */
let dragged: string | null = null;

export function setDraggedPart(id: string | null) {
  dragged = id;
}

export function draggedPart(): Part | null {
  return dragged ? partById(dragged) : null;
}

/** Adds a palette part as one undoable change: attached to its target, placed free-standing, or refused with a toast. */
export function runPart(store: SketchStore, part: Part, drop?: PartDrop) {
  const st = store.state;
  const out = applyPart(st.elements, { selection: st.selection, activeCell: st.activeCell, lastKey: store.lastKey }, part, drop);
  switch (out.kind) {
    case "insert":
      insertElements(store, out.elements, out.at ?? undefined);
      return;
    case "changes":
      store.commit(out.changes, { select: out.select });
      if (out.activeCell !== undefined) store.setActiveCell(out.activeCell);
      store.setTool("select");
      if (out.edit) store.setEditing(out.edit);
      return;
    case "tool":
      store.setTool(out.tool);
      toast(out.message);
      return;
    case "refused":
      toast(out.reason);
      return;
  }
}
