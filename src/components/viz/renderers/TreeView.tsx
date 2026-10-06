"use client";

import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { AnimatePresence, motion } from "motion/react";
import type { StateOf } from "@/lib/ai/schemas/vizSpec";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_SVG, SPRING, TONE_SVG } from "../tones";
import type { RendererProps } from "./types";

type TreeState = StateOf<"tree">;
type Datum = { id: string; ghost?: boolean };

const R = 18;
const DX = 52;
const DY = 64;
const PAD = 28;

/**
 * Binary nodes keep their left/right sides: a lone right child gets an
 * invisible left sibling so it doesn't drift under its parent.
 */
function layout(state: TreeState) {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const kids = (id: string): string[] => {
    const n = byId.get(id);
    if (!n) return [];
    if (n.children?.length) return n.children.filter((c) => byId.has(c));
    return [n.left, n.right].filter((c): c is string => Boolean(c && byId.has(c)));
  };

  // Detached subtrees (mid-rotation, freshly created nodes) get drawn too,
  // as extra roots beside the real one.
  const referenced = new Set(state.nodes.flatMap((n) => kids(n.id)));
  const rootIds = [
    ...(state.rootId && byId.has(state.rootId) ? [state.rootId] : []),
    ...state.nodes.filter((n) => n.id !== state.rootId && !referenced.has(n.id)).map((n) => n.id),
  ];

  const placed = new Set<string>(); // guards against cycles in malformed input
  const childrenOf = (d: Datum): Datum[] => {
    if (d.id === "__super__") return rootIds.map((id) => ({ id }));
    if (d.ghost || placed.has(d.id)) return [];
    placed.add(d.id);
    const n = byId.get(d.id)!;
    if (n.children?.length) return kids(d.id).filter((c) => !placed.has(c)).map((id) => ({ id }));
    const left = n.left && byId.has(n.left) && !placed.has(n.left) ? n.left : null;
    const right = n.right && byId.has(n.right) && !placed.has(n.right) ? n.right : null;
    if (!left && !right) return [];
    return [
      left ? { id: left } : { id: `${d.id}:L`, ghost: true },
      right ? { id: right } : { id: `${d.id}:R`, ghost: true },
    ];
  };
  const full = hierarchy<Datum>({ id: "__super__", ghost: true }, childrenOf);
  d3tree<Datum>().nodeSize([DX, DY])(full);

  const nodes = full.descendants().filter((d) => !d.data.ghost);
  const links = full.links().filter((l) => !l.source.data.ghost && !l.target.data.ghost);
  const xs = nodes.map((n) => n.x!);
  const ys = nodes.map((n) => n.y!);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, DY);
  const maxY = Math.max(...ys, DY);
  return {
    nodes: nodes.map((n) => ({ id: n.data.id, x: n.x! - minX + PAD, y: n.y! - minY + PAD })),
    links: links.map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      x1: l.source.x! - minX + PAD,
      y1: l.source.y! - minY + PAD,
      x2: l.target.x! - minX + PAD,
      y2: l.target.y! - minY + PAD,
    })),
    width: maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
  };
}

export function TreeView({ state, deco }: RendererProps<"tree">) {
  if (state.nodes.length === 0) return <p className="text-sm text-muted-foreground italic">empty tree</p>;
  const { nodes, links, width, height } = layout(state);
  const values = new Map(state.nodes.map((n) => [n.id, n.value]));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full" role="img">
      <AnimatePresence initial={false}>
        {links.map((l) => (
          <motion.line
            key={l.id}
            initial={{ opacity: 0, x1: l.x1, y1: l.y1, x2: l.x1, y2: l.y1 }}
            animate={{ opacity: 1, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            stroke="var(--border)"
            strokeWidth={2}
          />
        ))}
        {nodes.map((n) => {
          const tone = deco.tones.get(n.id);
          const colors = tone ? TONE_SVG[tone] : NEUTRAL_SVG;
          const pointers = deco.pointers.filter((p) => String(p.index) === n.id);
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, x: n.x, y: n.y - 12 }}
              animate={{ opacity: 1, x: n.x, y: n.y }}
              exit={{ opacity: 0 }}
              transition={SPRING}
            >
              <circle
                r={R}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={tone ? 2.5 : 1.5}
                style={{ transition: "fill 300ms, stroke 300ms" }}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground font-mono text-[13px] font-medium"
              >
                {formatValue(values.get(n.id))}
              </text>
              {pointers.length > 0 && (
                <text
                  y={R + 12}
                  textAnchor="middle"
                  className="fill-viz-pointer font-mono text-[10px] font-semibold"
                >
                  {pointers.map((p) => p.name).join(", ")}
                </text>
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
