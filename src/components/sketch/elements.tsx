"use client";

import { getStroke } from "perfect-freehand";
import { cn } from "@/lib/utils";
import {
  CELL_H,
  INDEX_H,
  LABEL_H,
  NOTE_W,
  ROW_LABEL_W,
  RESIZE_HANDLES,
  SHAPE_LINE_HEIGHT,
  arrowheadPath,
  cellRect,
  elementBounds,
  hasIndexRow,
  matrixCellRect,
  nodeSize,
  noteHeight,
  noteMetrics,
  pointerLabelRect,
  shapeOutlinePath,
  shapeTextRect,
  tableColumns,
  tableRowRect,
  textBox,
  textMetrics,
  type Point,
  type Rect,
  type ResizeHandle,
  type TextMetrics,
} from "@/lib/sketch/layout";
import { FONT_CSS, FREEHAND_PX, STROKE_PX, colorCss, dashArray, fillCss, styleOf, type Style } from "@/lib/sketch/style";
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
      className="absolute flex items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-paper font-mono text-[13px] text-ink"
      style={{ left: el.x, top: el.y, width: w, height: h }}
    >
      {el.value || EMPTY}
    </div>
  );
}

/** CSS for text drawn in a style: family, size, weight, line height, alignment and colour. */
export function textCss(style: Pick<Style, "fontFamily" | "fontWeight" | "textAlign" | "strokeColor">, m: TextMetrics): React.CSSProperties {
  return {
    fontFamily: FONT_CSS[style.fontFamily],
    fontSize: m.px,
    fontWeight: style.fontWeight === "bold" ? 700 : 400,
    lineHeight: `${m.lineH}px`,
    textAlign: style.textAlign,
    color: colorCss(style.strokeColor),
  };
}

function NoteView({ el }: { el: ElementOf<"note"> }) {
  const s = styleOf(el);
  const m = noteMetrics(el);
  // A note without a picked background keeps the original translucent mint.
  const fill = el.fillColor ? { background: fillCss(el.fillColor), borderColor: "color-mix(in oklab, currentColor 25%, transparent)" } : null;
  return (
    <div
      data-el={el.id}
      className={cn(
        "absolute overflow-hidden rounded-sm border px-2.5 py-2.5 break-words whitespace-pre-wrap shadow-sm",
        !fill && "border-brand/60 bg-brand-soft",
      )}
      style={{ left: el.x, top: el.y, width: NOTE_W, height: noteHeight(el.text, m), opacity: s.opacity / 100, ...textCss(s, m), ...fill }}
    >
      {el.text || <span className="text-muted-foreground">Note</span>}
    </div>
  );
}

function TextView({ el }: { el: ElementOf<"text"> }) {
  const s = styleOf(el);
  const { w } = textBox(el);
  return (
    <div
      data-el={el.id}
      className="absolute whitespace-pre"
      style={{ left: el.x, top: el.y, width: w, opacity: s.opacity / 100, ...textCss(s, textMetrics(s)) }}
    >
      {el.text || <span className="text-muted-foreground">Text</span>}
    </div>
  );
}

/** perfect-freehand's outline as an SVG path. */
export function strokePath(points: readonly (readonly number[])[], size = 4): string {
  const outline = getStroke(points as number[][], { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: false });
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
  const s = styleOf(el);
  return (
    <svg
      data-el={el.id}
      className="absolute overflow-visible"
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, opacity: s.opacity / 100 }}
      viewBox={`${b.x - el.x} ${b.y - el.y} ${b.w} ${b.h}`}
    >
      <path d={strokePath(el.points, FREEHAND_PX[s.strokeWidth])} style={{ fill: colorCss(s.strokeColor) }} />
    </svg>
  );
}

/** Stroke attributes for an outline or line in a style. Dots are round dashes of no length. */
function strokeProps(s: Style) {
  const width = STROKE_PX[s.strokeWidth];
  return {
    stroke: colorCss(s.strokeColor),
    strokeWidth: width,
    strokeDasharray: dashArray(s.strokeStyle, width),
    strokeLinecap: s.strokeStyle === "dotted" ? ("round" as const) : undefined,
    strokeLinejoin: "round" as const,
  };
}

/**
 * A free shape: the outline in SVG, the text in HTML on top, wrapped to the shape's text area and centred. With a
 * background, a click anywhere inside the outline (the real ellipse or diamond, not its box) hits it. Without
 * one, only the outline and the words do, so a click inside an empty frame can start a marquee, as in
 * Excalidraw; once the shape is selected its inside hits too, so it can be dragged from anywhere.
 */
function ShapeView({ el, selected, editingText }: { el: ElementOf<"shape">; selected: boolean; editingText: boolean }) {
  const s = styleOf(el);
  const stroke = strokeProps(s);
  const d = shapeOutlinePath(el, stroke.strokeWidth);
  const text = shapeTextRect(el);
  const m = textMetrics(s, SHAPE_LINE_HEIGHT);
  const insideHits = s.fillColor !== "transparent" || selected;
  return (
    <div
      data-el={el.id}
      className="pointer-events-none absolute"
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, opacity: s.opacity / 100 }}
    >
      <svg className="absolute top-0 left-0 overflow-visible" width={el.w} height={el.h} aria-hidden>
        <path d={d} fill={fillCss(s.fillColor)} {...stroke} />
        <path d={d} fill="transparent" stroke="transparent" strokeWidth={stroke.strokeWidth + 12} pointerEvents={insideHits ? "all" : "stroke"} />
      </svg>
      {el.text && !editingText && (
        <div
          className="absolute flex flex-col justify-center break-words whitespace-pre-wrap"
          style={{ ...box(text, el), ...textCss(s, m) }}
        >
          <div>
            <span className="pointer-events-auto">{el.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** A line or arrow through its points, with heads drawn as paths so they take the line's colour and width. */
function LineView({ el, selected }: { el: ElementOf<"line">; selected: boolean }) {
  const s = styleOf(el);
  const stroke = strokeProps(s);
  const pts: Point[] = el.points.map(([x, y]) => ({ x, y }));
  const d = pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const heads = [
    s.startHead !== "none" && { kind: s.startHead, d: arrowheadPath(pts[0], pts[1], s.startHead, stroke.strokeWidth) },
    s.endHead !== "none" && { kind: s.endHead, d: arrowheadPath(pts[pts.length - 1], pts[pts.length - 2], s.endHead, stroke.strokeWidth) },
  ].filter((h): h is { kind: "arrow" | "triangle"; d: string } => Boolean(h));
  return (
    <svg
      data-el={el.id}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: el.x, top: el.y, opacity: s.opacity / 100 }}
      width={1}
      height={1}
      aria-hidden
    >
      {selected && <path data-export-skip="" d={d} fill="none" className="stroke-brand/50" strokeWidth={stroke.strokeWidth + 8} strokeLinecap="round" strokeLinejoin="round" />}
      <path d={d} fill="none" {...stroke} />
      {heads.map((h, i) => (
        <path
          key={i}
          d={h.d}
          fill={h.kind === "triangle" ? stroke.stroke : "none"}
          stroke={stroke.stroke}
          strokeWidth={stroke.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <path d={d} fill="none" stroke="transparent" strokeWidth={stroke.strokeWidth + 14} pointerEvents="stroke" />
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

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
};

/**
 * Handles on the one selected element: eight resize squares on a shape's selection box, a dot on each end of a
 * line (filled when that end is attached to an element). They keep their screen size at any zoom. `data-handle` tells the canvas which was grabbed; none of this
 * is part of an exported picture.
 */
export function SelectionHandles({ el, zoom }: { el: SketchElement; zoom: number }) {
  const size = 9 / zoom;
  const border = 1.5 / zoom;
  const dot = (key: string, p: Point, handle: string, cursor: string, round: boolean, filled = false) => (
    <div
      key={key}
      data-el={el.id}
      data-handle={handle}
      data-export-skip=""
      className={cn("absolute border-brand-strong", filled ? "bg-brand" : "bg-paper", cursor, round ? "rounded-full" : "rounded-[2px]")}
      style={{ left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderWidth: border }}
    />
  );
  if (el.type === "shape") {
    // On the selection box, which sits 4 units outside the shape.
    const x0 = el.x - 4;
    const y0 = el.y - 4;
    const x1 = el.x + el.w + 4;
    const y1 = el.y + el.h + 4;
    return RESIZE_HANDLES.map((h) =>
      dot(
        h,
        { x: h.includes("w") ? x0 : h.includes("e") ? x1 : (x0 + x1) / 2, y: h.includes("n") ? y0 : h.includes("s") ? y1 : (y0 + y1) / 2 },
        `resize-${h}`,
        HANDLE_CURSOR[h],
        false,
      ),
    );
  }
  if (el.type === "line") {
    // A filled dot is an end attached to an element.
    const [a, b] = [el.points[0], el.points[el.points.length - 1]];
    return [
      dot("start", { x: el.x + a[0], y: el.y + a[1] }, "line-start", "cursor-move", true, Boolean(el.startBinding)),
      dot("end", { x: el.x + b[0], y: el.y + b[1] }, "line-end", "cursor-move", true, Boolean(el.endBinding)),
    ];
  }
  return null;
}

/**
 * One element, except pointers and links, which the connector layer draws. `selected` lets an empty shape be
 * dragged from inside; `editingText` hides a shape's text while the editor sits over it.
 */
export function ElementView({
  el,
  activeCell,
  selected = false,
  editingText = false,
}: {
  el: SketchElement;
  activeCell: { elementId: string; index: number } | null;
  selected?: boolean;
  editingText?: boolean;
}) {
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
    case "shape":
      return <ShapeView el={el} selected={selected} editingText={editingText} />;
    case "line":
      return <LineView el={el} selected={selected} />;
    case "pointer":
    case "link":
      return null;
  }
}
