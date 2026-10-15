"use client";

import { center, isOutOfRange, linkSegment, nodeShape, pointerSegment, type ElementMap, type Point, type Segment, type Shape } from "@/lib/sketch/layout";
import type { ElementOf, SketchElement } from "@/lib/sketch/types";
import type { Overlay } from "./store";
import { strokePath } from "./elements";

/**
 * Links and pointer arrows, drawn from the layout of what they connect, plus what an unfinished gesture shows.
 * The SVG itself ignores the pointer; each line has a wide invisible stroke that can be clicked.
 */

const line = ({ from, to }: Segment) => `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

function Marker({ id, className }: { id: string; className: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" className={className} />
    </marker>
  );
}

function SnapShape({ shape }: { shape: Shape }) {
  const cls = "fill-brand/15 stroke-brand";
  return shape.kind === "circle" ? (
    <circle cx={shape.cx} cy={shape.cy} r={shape.r + 3} className={cls} strokeWidth={2} />
  ) : (
    <rect x={shape.rect.x - 2} y={shape.rect.y - 2} width={shape.rect.w + 4} height={shape.rect.h + 4} rx={4} className={cls} strokeWidth={2} />
  );
}

export function Connectors({
  elements,
  live,
  selection,
  overlay,
}: {
  elements: ElementMap;
  live: readonly SketchElement[];
  selection: ReadonlySet<string>;
  overlay: Overlay | null;
}) {
  const links = live.filter((el): el is ElementOf<"link"> => el.type === "link");
  const pointers = live.filter((el): el is ElementOf<"pointer"> => el.type === "pointer");
  const aiming = overlay?.kind === "aim" ? overlay.pointerId : null;
  const linkFrom = overlay?.kind === "link" ? elements.get(overlay.fromId) : undefined;

  return (
    <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      <defs>
        <Marker id="sk-head-ink" className="fill-ink" />
        <Marker id="sk-head-blue" className="fill-pen-blue" />
        <Marker id="sk-head-red" className="fill-pen-red" />
        <Marker id="sk-head-brand" className="fill-brand-strong" />
      </defs>

      {links.map((el) => {
        const seg = linkSegment(elements, el);
        if (!seg) return null;
        const selected = selection.has(el.id);
        const directed = el.from.port !== "edge";
        return (
          <g key={el.id} data-el={el.id}>
            {selected && <path d={line(seg)} className="stroke-brand/50" strokeWidth={8} strokeLinecap="round" />}
            <path
              d={line(seg)}
              className="stroke-ink"
              strokeWidth={2}
              markerEnd={directed ? "url(#sk-head-ink)" : undefined}
            />
            <path d={line(seg)} stroke="transparent" strokeWidth={14} pointerEvents="stroke" className="cursor-pointer" />
            {seg.toNull && (
              <text
                x={seg.to.x + (el.from.port === "left" ? -4 : 4)}
                y={seg.to.y + (el.from.port === "next" ? 4 : 12)}
                textAnchor={el.from.port === "left" ? "end" : "start"}
                className="fill-muted-foreground font-mono text-[11px]"
              >
                null
              </text>
            )}
          </g>
        );
      })}

      {pointers.map((el) => {
        if (el.id === aiming) return null;
        const seg = pointerSegment(elements, el);
        if (!seg) return null;
        const red = !el.target || isOutOfRange(elements, el.target);
        const selected = selection.has(el.id);
        return (
          <g key={el.id} data-el={el.id}>
            {selected && <path d={line(seg)} className="stroke-brand/50" strokeWidth={8} strokeLinecap="round" />}
            <path
              d={line(seg)}
              className={red ? "stroke-pen-red" : "stroke-pen-blue"}
              strokeWidth={2}
              strokeDasharray={el.target ? undefined : "4 4"}
              markerEnd={`url(#sk-head-${red ? "red" : "blue"})`}
            />
            <path d={line(seg)} stroke="transparent" strokeWidth={14} pointerEvents="stroke" className="cursor-pointer" />
            {selected && selection.size === 1 && (
              <circle
                data-el={el.id}
                data-handle="aim"
                cx={seg.to.x}
                cy={seg.to.y}
                r={6}
                pointerEvents="all"
                className="cursor-crosshair fill-paper stroke-brand-strong"
                strokeWidth={2}
              >
                <title>Drag to point somewhere else</title>
              </circle>
            )}
          </g>
        );
      })}

      {overlay?.kind === "pointer" && <Preview from={overlay.from} to={overlay.to} snap={overlay.snap} />}
      {overlay?.kind === "aim" && <AimPreview elements={elements} overlay={overlay} />}
      {overlay?.kind === "link" && linkFrom?.type === "node" && (
        <path
          d={line({ from: center(nodeShape(linkFrom)), to: overlay.to })}
          className="stroke-brand-strong"
          strokeWidth={2}
          strokeDasharray="6 4"
          markerEnd="url(#sk-head-brand)"
        />
      )}
      {overlay?.kind === "freehand" && <path d={strokePath(overlay.points)} className="fill-ink" />}
    </svg>
  );
}

function Preview({ from, to, snap }: { from: Point; to: Point; snap: Shape | null }) {
  return (
    <>
      {snap && <SnapShape shape={snap} />}
      <path d={line({ from, to })} className="stroke-pen-blue" strokeWidth={2} strokeDasharray="6 4" markerEnd="url(#sk-head-blue)" />
      <circle cx={from.x} cy={from.y} r={4} className="fill-pen-blue" />
    </>
  );
}

function AimPreview({ elements, overlay }: { elements: ElementMap; overlay: Extract<Overlay, { kind: "aim" }> }) {
  const el = elements.get(overlay.pointerId);
  if (el?.type !== "pointer") return null;
  const seg = pointerSegment(elements, { ...el, target: null, end: overlay.to });
  if (!seg) return null;
  return (
    <>
      {overlay.snap && <SnapShape shape={overlay.snap} />}
      <path d={line(seg)} className="stroke-pen-blue" strokeWidth={2} strokeDasharray="6 4" markerEnd="url(#sk-head-blue)" />
    </>
  );
}
