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
import { useSketch, type ShapeTool, type SketchStore, type Tool } from "./store";

const TOOLS: { tool: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { tool: "select", label: "Select and move", key: "V", icon: MousePointer2Icon },
  { tool: "hand", label: "Pan (or hold Space)", key: "H", icon: HandIcon },
  { tool: "pointer", label: "Pointer: click a cell or node, or drag to one", key: "P", icon: ArrowUpRightIcon },
  { tool: "link", label: "Link: drag from a node to another, or to empty space for null", key: "L", icon: SplineIcon },
  { tool: "freehand", label: "Draw", key: "D", icon: PencilIcon },
  { tool: "note", label: "Note", key: "N", icon: StickyNoteIcon },
  { tool: "text", label: "Text", key: "T", icon: TypeIcon },
];

/** Glyphs for the shape tools, drawn like lucide's icons (24 units, 2px strokes) so sharp and round corners differ. */
export function ShapeGlyph({ tool, className }: { tool: ShapeTool; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden {...common}>
      {tool === "rectangle" && <rect x="3.5" y="5.5" width="17" height="13" />}
      {tool === "rounded" && <rect x="3.5" y="5.5" width="17" height="13" rx="4" />}
      {tool === "diamond" && <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />}
      {tool === "ellipse" && <ellipse cx="12" cy="12" rx="8.5" ry="7" />}
      {tool === "line" && <path d="M5 19 19 5" />}
      {tool === "arrow" && <path d="M5 19 19 5M10 5h9v9" />}
    </svg>
  );
}

const SHAPE_ITEMS: { tool: ShapeTool; label: string; key: string }[] = [
  { tool: "rectangle", label: "Rectangle", key: "R" },
  { tool: "rounded", label: "Rounded rectangle", key: "U" },
  { tool: "diamond", label: "Diamond", key: "3" },
  { tool: "ellipse", label: "Ellipse", key: "O" },
  { tool: "arrow", label: "Arrow", key: "A" },
  { tool: "line", label: "Line", key: "I" },
];

const SHAPE_HINT = "drag to draw, Shift keeps it square, double-click to write in it";
const LINE_HINT = "drag from one element to another to connect them, Shift snaps the angle, Ctrl leaves the ends free";

const bar = "flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-sm";

/** Tools and undo along the top of the canvas; zoom in the bottom corner. */
export function CanvasToolbar({ store, readOnly }: { store: SketchStore; readOnly: boolean }) {
  const s = useSketch(store);
  return (
    <>
      {!readOnly && (
        <div role="toolbar" aria-label="Tools" className={cn(bar, "absolute top-3 left-1/2 z-20 max-w-[calc(100%-1.5rem)] -translate-x-1/2 overflow-x-auto")}>
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
          {SHAPE_ITEMS.map(({ tool, label, key }) => {
            const title = `${label}: ${tool === "line" || tool === "arrow" ? LINE_HINT : SHAPE_HINT} (${key})`;
            return (
              <Button
                key={tool}
                variant="ghost"
                size="icon-sm"
                aria-pressed={s.tool === tool}
                aria-label={`${label} (${key})`}
                title={title}
                className={cn(s.tool === tool && "bg-brand-soft text-ink hover:bg-brand-soft")}
                onClick={() => store.setTool(tool)}
              >
                <ShapeGlyph tool={tool} />
              </Button>
            );
          })}
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
