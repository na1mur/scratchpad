"use client";

import { Graph, layout as dagreLayout } from "@dagrejs/dagre";
import { motion } from "motion/react";
import type { StateOf } from "@/lib/ai/schemas/vizSpec";
import { NEUTRAL_SVG, SPRING, TONE_SVG } from "../tones";
import type { RendererProps } from "./types";

type GraphState = StateOf<"graph">;
type Pos = { x: number; y: number };

const R = 20;
const PAD = 32;

/**
 * Positions come from every node that ever appears in the run, so nodes
 * never jump around while stepping. Undirected graphs use a circle;
 * directed ones a layered dagre layout.
 */
function stableLayout(history: GraphState[]) {
  const nodeIds: string[] = [];
  const seen = new Set<string>();
  const edges = new Map<string, { from: string; to: string }>();
  for (const s of history) {
    for (const n of s.nodes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      nodeIds.push(n.id);
    }
    for (const e of s.edges) edges.set(`${e.from}->${e.to}`, e);
  }
  const directed = history.some((s) => s.directed);
  const pos = new Map<string, Pos>();

  if (!directed || nodeIds.length <= 2) {
    const n = nodeIds.length;
    const radius = Math.max(60, (n * (R * 2 + 26)) / (2 * Math.PI));
    nodeIds.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      pos.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    });
  } else {
    const g = new Graph();
    g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 56, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    nodeIds.forEach((id) => g.setNode(id, { width: R * 2, height: R * 2 }));
    for (const e of edges.values()) if (seen.has(e.from) && seen.has(e.to)) g.setEdge(e.from, e.to);
    dagreLayout(g);
    nodeIds.forEach((id) => {
      const n = g.node(id);
      pos.set(id, { x: n.x, y: n.y });
    });
  }

  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  for (const [id, p] of pos) pos.set(id, { x: p.x - minX + PAD, y: p.y - minY + PAD });
  return {
    pos,
    width: Math.max(...xs) - minX + PAD * 2,
    height: Math.max(...ys) - minY + PAD * 2,
  };
}

/** Pulls the segment back so it ends at the circle edge (room for an arrow). */
function trim(a: Pos, b: Pos, by: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: a.x + (dx / len) * by,
    y1: a.y + (dy / len) * by,
    x2: b.x - (dx / len) * by,
    y2: b.y - (dy / len) * by,
  };
}

export function GraphView({ structure, state, history, deco }: RendererProps<"graph">) {
  if (state.nodes.length === 0) return <p className="text-sm text-muted-foreground italic">empty graph</p>;
  const { pos, width, height } = stableLayout(history.length ? history : [state]);
  const markerId = `arrow-${structure.id}`;
  const edgeTone = (from: string, to: string) =>
    deco.tones.get(`${from}->${to}`) ??
    deco.tones.get(`${from}-${to}`) ??
    (!state.directed ? (deco.tones.get(`${to}->${from}`) ?? deco.tones.get(`${to}-${from}`)) : undefined);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full" role="img">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
        </marker>
      </defs>
      {state.edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const tone = edgeTone(e.from, e.to);
        const line = trim(a, b, state.directed ? R + 3 : R);
        return (
          <g key={`${e.from}->${e.to}`}>
            <line
              {...line}
              stroke={tone ? TONE_SVG[tone].stroke : "var(--border)"}
              strokeWidth={tone ? 3 : 2}
              markerEnd={state.directed ? `url(#${markerId})` : undefined}
              style={{ transition: "stroke 300ms" }}
            />
            {e.weight !== undefined && (
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 6}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[11px]"
              >
                {e.weight}
              </text>
            )}
          </g>
        );
      })}
      {state.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const tone = deco.tones.get(n.id);
        const colors = tone ? TONE_SVG[tone] : NEUTRAL_SVG;
        const pointers = deco.pointers.filter((x) => String(x.index) === n.id);
        return (
          <motion.g
            key={n.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: tone === "active" || tone === "error" ? 1.1 : 1 }}
            transition={SPRING}
            style={{ x: p.x, y: p.y }}
          >
            <circle
              r={R}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={tone ? 2.5 : 1.5}
              style={{ transition: "fill 300ms, stroke 300ms" }}
            />
            <text textAnchor="middle" dominantBaseline="central" className="fill-foreground font-mono text-[13px] font-medium">
              {n.label}
            </text>
            {pointers.length > 0 && (
              <text y={-R - 6} textAnchor="middle" className="fill-viz-pointer font-mono text-[10px] font-semibold">
                {pointers.map((x) => x.name).join(", ")}
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}
