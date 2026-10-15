"use client";

import { getStroke } from "perfect-freehand";
import { cn } from "@/lib/utils";
import {
  CELL_H,
  INDEX_H,
  LABEL_H,
  NOTE_W,
  ROW_LABEL_W,
  TEXT_SIZE_PX,
  cellRect,
  elementBounds,
  hasIndexRow,
  matrixCellRect,
  nodeSize,
  noteHeight,
  pointerLabelRect,
  tableColumns,
  tableRowRect,
  type Rect,
} from "@/lib/sketch/layout";
import type { CellsElement, ElementOf, SketchElement, TableElement } from "@/lib/sketch/types";

/**
 * The DOM for each element, placed in scene units inside the camera's transformed layer. Positions come from
 * src/lib/sketch/layout.ts and nothing here sizes itself, so arrows computed from the layout always meet the
 * boxes drawn. `data-*` attributes tell the canvas what was clicked: `data-el` the element, `data-cell`,
 * `data-row`/`data-col`, `data-entry`/`data-part` and `data-label` the part of it.
 */

const box = (r: Rect, origin: { x: number; y: number }) => ({
  left: r.x - origin.x,
  top: r.y - origin.y,
  width: r.w,
  height: r.h,
});

const EMPTY = <span className="text-muted-foreground/50">·</span>;

function Label({ el }: { el: { label: string } & SketchElement }) {
  if (!el.label) return null;
  return (
    <div
      data-label=""
      className="absolute top-0 left-0 truncate font-mono text-xs leading-5 font-medium text-muted-foreground"
      style={{ height: LABEL_H, maxWidth: 320 }}
    >
      {el.label}
    </div>
  );
}

function CellsView({ el, activeIndex }: { el: CellsElement; activeIndex: number | null }) {
  const bounds = elementBounds(el)!;
  const n = el.values.length;
  const stack = el.type === "stack";
  return (
    <div data-el={el.id} className="absolute" style={{ left: el.x, top: el.y, width: bounds.w, height: bounds.h }}>
      <Label el={el} />
      {n === 0 && (
        <div
          className="absolute flex items-center justify-center rounded-sm border border-dashed border-ink/40 text-[11px] text-muted-foreground"
          style={box(cellRect(el, 0), el)}
        >
          empty
        </div>
      )}
      {el.values.map((v, i) => (
        <div
          key={el.cellIds[i] ?? i}
          data-cell={i}
          className={cn(
            "absolute flex items-center justify-center overflow-hidden bg-paper font-mono text-[13px] text-ink",
            el.type === "set"
              ? "scale-90 rounded-full border border-ink/60"
              : stack
                ? cn("border-x-2 border-t border-ink/60", i === 0 && "border-b-2")
                : cn("border-y border-r border-ink/60", i === 0 && "border-l"),
            el.type === "array" && el.variant === "string" && "font-semibold",
            activeIndex === i && "z-10 outline-2 -outline-offset-2 outline-brand",
          )}
          style={box(cellRect(el, i), el)}
        >
          {v || EMPTY}
        </div>
      ))}
      {el.type === "array" &&
        el.values.map((_, i) => {
          const r = cellRect(el, i);
          return (
            <div
              key={`i${i}`}
              className="absolute text-center font-mono text-[11px] leading-[18px] text-muted-foreground"
              style={{ ...box(r, el), top: r.y + CELL_H - el.y, height: INDEX_H }}
            >
              {i}
            </div>
          );
        })}
      {el.type === "queue" && n > 0 && hasIndexRow(el) && (
        <>
          <QueueEnd el={el} index={0} text="front" />
          {n > 1 && <QueueEnd el={el} index={n - 1} text="back" />}
        </>
      )}
    </div>
  );
}

function QueueEnd({ el, index, text }: { el: CellsElement; index: number; text: string }) {
  const r = cellRect(el, index);
  return (
    <div
      className="absolute text-center text-[11px] leading-[18px] text-muted-foreground"
      style={{ ...box(r, el), top: r.y + CELL_H - el.y, height: INDEX_H }}
    >
      {text}
    </div>
  );
}

function MatrixView({ el, active }: { el: ElementOf<"matrix">; active: { row: number; col: number } | null }) {
  const bounds = elementBounds(el)!;
  const cols = Math.max(...el.rows.map((r) => r.length));
  return (
    <div data-el={el.id} className="absolute" style={{ left: el.x, top: el.y, width: bounds.w, height: bounds.h }}>
      <Label el={el} />
      {Array.from({ length: cols }, (_, c) => {
        const r = matrixCellRect(el, 0, c);
        return (
          <div
            key={`c${c}`}
            className="absolute text-center font-mono text-[11px] leading-[18px] text-muted-foreground"
            style={{ ...box(r, el), top: LABEL_H, height: INDEX_H }}
          >
            {c}
          </div>
        );
      })}
      {el.rows.map((row, ri) => (
        <div key={`r${ri}`}>
          <div
            className="absolute text-center font-mono text-[11px] text-muted-foreground"
            style={{ left: 0, top: matrixCellRect(el, ri, 0).y - el.y, width: ROW_LABEL_W, height: CELL_H, lineHeight: `${CELL_H}px` }}
          >
            {ri}
          </div>
          {row.map((v, ci) => (
            <div
              key={ci}
              data-row={ri}
              data-col={ci}
              className={cn(
                "absolute flex items-center justify-center overflow-hidden border-r border-b border-ink/60 bg-paper font-mono text-[13px] text-ink",
                ci === 0 && "border-l",
                ri === 0 && "border-t",
                active?.row === ri && active.col === ci && "z-10 outline-2 -outline-offset-2 outline-brand",
              )}
              style={box(matrixCellRect(el, ri, ci), el)}
            >
              {v || EMPTY}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TableView({ el }: { el: TableElement }) {
  const bounds = elementBounds(el)!;
  const { keyW } = tableColumns(el);
  return (
    <div data-el={el.id} className="absolute" style={{ left: el.x, top: el.y, width: bounds.w, height: bounds.h }}>
      <Label el={el} />
      {el.entries.length === 0 && (
        <div
          className="absolute flex items-center justify-center rounded-sm border border-dashed border-ink/40 text-[11px] text-muted-foreground"
          style={box(tableRowRect(el, 0), el)}
        >
          empty
        </div>
      )}
      {el.entries.map(([k, v], row) => {
        const r = tableRowRect(el, row);
        return (
          <div
            key={row}
            data-entry={row}
            className={cn("absolute flex border-x border-b border-ink/60 font-mono text-[13px] text-ink", row === 0 && "border-t")}
            style={box(r, el)}
          >
            <div
              data-entry={row}
              data-part={0}
              className="flex shrink-0 items-center justify-center overflow-hidden border-r border-ink/40 bg-tile"
              style={{ width: keyW }}
            >
              {k || EMPTY}
            </div>
            <div data-entry={row} data-part={1} className="flex flex-1 items-center justify-center overflow-hidden bg-paper">
              {v || EMPTY}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NodeView({ el }: { el: ElementOf<"node"> }) {
  const { w, h } = nodeSize(el);
  return (
    <div
      data-el={el.id}
      className={cn(
        "absolute flex items-center justify-center overflow-hidden border-2 border-ink bg-paper font-mono text-[13px] text-ink",
        el.variant === "list" ? "rounded-md" : "rounded-full",
      )}
      style={{ left: el.x, top: el.y, width: w, height: h }}
    >
      {el.value || EMPTY}
    </div>
  );
}

function NoteView({ el }: { el: ElementOf<"note"> }) {
  return (
    <div
      data-el={el.id}
      className="absolute overflow-hidden rounded-sm border border-brand/60 bg-brand-soft px-2.5 py-2.5 text-[13px] leading-5 break-words whitespace-pre-wrap text-ink shadow-sm"
      style={{ left: el.x, top: el.y, width: NOTE_W, height: noteHeight(el.text) }}
    >
      {el.text || <span className="text-muted-foreground">Note</span>}
    </div>
  );
}

function TextView({ el }: { el: ElementOf<"text"> }) {
  const px = TEXT_SIZE_PX[el.size];
  return (
    <div
      data-el={el.id}
      className="absolute font-mono whitespace-pre text-ink"
      style={{ left: el.x, top: el.y, fontSize: px, lineHeight: 1.35 }}
    >
      {el.text || <span className="text-muted-foreground">Text</span>}
    </div>
  );
}

const TONE_CLASS = { ink: "fill-ink", blue: "fill-pen-blue", red: "fill-pen-red" } as const;

/** perfect-freehand's outline as an SVG path. */
export function strokePath(points: readonly (readonly number[])[]): string {
  const outline = getStroke(points as number[][], { size: 4, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: false });
  if (!outline.length) return "";
  const d = outline.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...outline[0], "Q"],
  );
  return `${d.join(" ")} Z`;
}

function FreehandView({ el }: { el: ElementOf<"freehand"> }) {
  const b = elementBounds(el)!;
  return (
    <svg
      data-el={el.id}
      className="absolute overflow-visible"
      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
      viewBox={`${b.x - el.x} ${b.y - el.y} ${b.w} ${b.h}`}
    >
      <path d={strokePath(el.points)} className={TONE_CLASS[el.tone]} />
    </svg>
  );
}

export function PointerLabel({ el, outOfRange }: { el: ElementOf<"pointer">; outOfRange: boolean }) {
  const r = pointerLabelRect(el);
  return (
    <div
      data-el={el.id}
      className={cn(
        "absolute flex items-center justify-center rounded-full font-mono text-xs font-semibold text-white shadow-sm dark:text-paper",
        outOfRange || !el.target ? "bg-pen-red" : "bg-pen-blue",
      )}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
    >
      {el.name}
    </div>
  );
}

/** One element, except pointers and links, which the connector layer draws. */
export function ElementView({ el, activeCell }: { el: SketchElement; activeCell: { elementId: string; index: number } | null }) {
  switch (el.type) {
    case "array":
    case "stack":
    case "queue":
    case "set":
      return <CellsView el={el} activeIndex={activeCell?.elementId === el.id ? activeCell.index : null} />;
    case "matrix":
      return <MatrixView el={el} active={null} />;
    case "hashmap":
    case "variables":
      return <TableView el={el} />;
    case "node":
      return <NodeView el={el} />;
    case "note":
      return <NoteView el={el} />;
    case "text":
      return <TextView el={el} />;
    case "freehand":
      return <FreehandView el={el} />;
    case "pointer":
    case "link":
      return null;
  }
}
