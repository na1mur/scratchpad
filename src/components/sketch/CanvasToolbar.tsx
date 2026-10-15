"use client";

import {
  ArrowUpRightIcon,
  HandIcon,
  MousePointer2Icon,
  PencilIcon,
  Redo2Icon,
  ScanIcon,
  SplineIcon,
  StickyNoteIcon,
  TypeIcon,
  Undo2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resetZoom, zoomAt, zoomToFit } from "./commands";
import { useSketch, type SketchStore, type Tool } from "./store";

const TOOLS: { tool: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { tool: "select", label: "Select and move", key: "V", icon: MousePointer2Icon },
  { tool: "hand", label: "Pan (or hold Space)", key: "H", icon: HandIcon },
  { tool: "pointer", label: "Pointer: click a cell or node, or drag to one", key: "P", icon: ArrowUpRightIcon },
  { tool: "link", label: "Link: drag from a node to another, or to empty space for null", key: "L", icon: SplineIcon },
  { tool: "freehand", label: "Draw", key: "D", icon: PencilIcon },
  { tool: "note", label: "Note", key: "N", icon: StickyNoteIcon },
  { tool: "text", label: "Text", key: "T", icon: TypeIcon },
];

const bar = "flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-sm";

/** Tools and undo along the top of the canvas; zoom in the bottom corner. */
export function CanvasToolbar({ store, readOnly }: { store: SketchStore; readOnly: boolean }) {
  const s = useSketch(store);
  return (
    <>
      {!readOnly && (
        <div role="toolbar" aria-label="Tools" className={cn(bar, "absolute top-3 left-1/2 z-20 -translate-x-1/2")}>
          {TOOLS.map(({ tool, label, key, icon: Icon }) => (
            <Button
              key={tool}
              variant="ghost"
              size="icon-sm"
              aria-pressed={s.tool === tool}
              aria-label={`${label} (${key})`}
              title={`${label} (${key})`}
              className={cn(s.tool === tool && "bg-brand-soft text-ink hover:bg-brand-soft")}
              onClick={() => store.setTool(tool)}
            >
              <Icon />
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => store.undo()}>
            <Undo2Icon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => store.redo()}>
            <Redo2Icon />
          </Button>
        </div>
      )}
      <div className={cn(bar, "absolute bottom-3 left-3 z-20")}>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAt(store, 1 / 1.2)}>
          <ZoomOutIcon />
        </Button>
        <Button variant="ghost" size="sm" className="w-14 font-mono tabular-nums" title="Reset zoom (Ctrl+0)" onClick={() => resetZoom(store)}>
          {Math.round(s.camera.zoom * 100)}%
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAt(store, 1.2)}>
          <ZoomInIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit everything in view" title="Fit everything in view (Shift+1)" onClick={() => zoomToFit(store)}>
          <ScanIcon />
        </Button>
      </div>
    </>
  );
}
