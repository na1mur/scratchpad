"use client";

import { useEffect, useRef, useState } from "react";
import { BringToFrontIcon, SendToBackIcon, TextAlignCenterIcon, TextAlignEndIcon, TextAlignStartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  COLOR_LABELS,
  FONT_CSS,
  STYLE_KEYS,
  applyStyle,
  colorCss,
  fillCss,
  isStyled,
  styleOf,
  takesStyle,
  type Style,
  type StyleKey,
  type StyledElement,
  type StylePatch,
} from "@/lib/sketch/style";
import { FILL_COLORS, SKETCH_COLORS } from "@/lib/sketch/types";
import { arrange } from "./commands";
import { isShapeTool, useSketch, type SketchStore } from "./store";

/**
 * Excalidraw's properties panel, smaller: the look of the selected shapes, lines, text, notes and drawings, or,
 * with a shape tool picked and nothing selected, of what that tool draws next. With several elements selected a
 * change applies to each that takes it, and a property they disagree on shows as mixed. Each change is one undo
 * step, and also becomes what the shape tools draw with.
 */

type Option<V> = { value: V; label: string; content: React.ReactNode };

function Group<V extends string>({
  label,
  options,
  value,
  onPick,
  wide,
}: {
  label: string;
  options: readonly Option<V>[];
  /** null: the selection disagrees. */
  value: V | null;
  onPick: (v: V) => void;
  wide?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {value === null && <span className="font-normal"> · mixed</span>}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.value}
            variant="ghost"
            size={wide ? "xs" : "icon-xs"}
            aria-pressed={value === o.value}
            aria-label={o.label}
            title={o.label}
            className={cn("border border-border", value === o.value && "border-brand bg-brand-soft text-ink hover:bg-brand-soft")}
            onClick={() => onPick(o.value)}
          >
            {o.content}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Swatches<V extends string>({
  label,
  colors,
  value,
  onPick,
  css,
}: {
  label: string;
  colors: readonly V[];
  value: V | null;
  onPick: (v: V) => void;
  css: (v: V) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {value === null && <span className="font-normal"> · mixed</span>}
      </span>
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            aria-label={COLOR_LABELS[c as keyof typeof COLOR_LABELS]}
            title={COLOR_LABELS[c as keyof typeof COLOR_LABELS]}
            className={cn(
              "relative size-5 overflow-hidden rounded-md border border-ink/20 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === c && "ring-2 ring-brand ring-offset-1 ring-offset-popover",
            )}
            style={{ background: c === "transparent" ? "var(--paper)" : css(c) }}
            onClick={() => onPick(c)}
          >
            {c === "transparent" && <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-1/2 -rotate-45 bg-pen-red" />}
          </button>
        ))}
      </div>
    </div>
  );
}

const line = (props: React.SVGProps<SVGPathElement>) => (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
    <path fill="none" stroke="currentColor" strokeLinecap="round" {...props} />
  </svg>
);

const WIDTHS: Option<Style["strokeWidth"]>[] = [
  { value: "thin", label: "Thin", content: line({ d: "M4 12h16", strokeWidth: 1 }) },
  { value: "bold", label: "Bold", content: line({ d: "M4 12h16", strokeWidth: 2.5 }) },
  { value: "extraBold", label: "Extra bold", content: line({ d: "M4 12h16", strokeWidth: 4.5 }) },
];
const STROKES: Option<Style["strokeStyle"]>[] = [
  { value: "solid", label: "Solid", content: line({ d: "M4 12h16", strokeWidth: 2 }) },
  { value: "dashed", label: "Dashed", content: line({ d: "M4 12h16", strokeWidth: 2, strokeDasharray: "4 3", strokeLinecap: "butt" }) },
  { value: "dotted", label: "Dotted", content: line({ d: "M4 12h16", strokeWidth: 2.5, strokeDasharray: "0.01 4.5" }) },
];
const EDGES: Option<Style["edges"]>[] = [
  { value: "sharp", label: "Sharp corners", content: line({ d: "M5 19V5h14", strokeWidth: 2, strokeLinecap: "butt" }) },
  { value: "round", label: "Round corners", content: line({ d: "M5 19v-8a6 6 0 0 1 6-6h8", strokeWidth: 2 }) },
];
const heads = (side: "start" | "end"): Option<Style["startHead"]>[] => {
  // Drawn pointing the way the head points on the line: left for the start, right for the end.
  const flip = side === "start" ? "scale(-1 1) translate(-24 0)" : undefined;
  const glyph = (d: string, fill = false) => (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <g transform={flip}>
        <path d="M4 12h15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        {d && <path d={d} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    </svg>
  );
  return [
    { value: "none", label: "No head", content: glyph("") },
    { value: "arrow", label: "Arrow", content: glyph("M14 7l5 5-5 5") },
    { value: "triangle", label: "Triangle", content: glyph("M14 7l6 5-6 5Z", true) },
  ];
};
const START_HEADS = heads("start");
const END_HEADS = heads("end");
const FONTS: Option<Style["fontFamily"]>[] = [
  { value: "hand", label: "Hand-drawn", content: <span style={{ fontFamily: FONT_CSS.hand, fontSize: 16 }}>Aa</span> },
  { value: "normal", label: "Normal", content: <span style={{ fontFamily: FONT_CSS.normal }}>Aa</span> },
  { value: "code", label: "Code", content: <span style={{ fontFamily: FONT_CSS.code }}>Aa</span> },
];
const SIZES: Option<Style["fontSize"]>[] = [
  { value: "s", label: "Small", content: "S" },
  { value: "m", label: "Medium", content: "M" },
  { value: "l", label: "Large", content: "L" },
  { value: "xl", label: "Extra large", content: "XL" },
];
const WEIGHTS: Option<Style["fontWeight"]>[] = [
  { value: "normal", label: "Normal weight", content: <span className="font-normal">B</span> },
  { value: "bold", label: "Bold", content: <span className="font-bold">B</span> },
];
const ALIGNS: Option<Style["textAlign"]>[] = [
  { value: "left", label: "Align left", content: <TextAlignStartIcon /> },
  { value: "center", label: "Align centre", content: <TextAlignCenterIcon /> },
  { value: "right", label: "Align right", content: <TextAlignEndIcon /> },
];

export function StylePanel({ store }: { store: SketchStore }) {
  const s = useSketch(store);
  const ref = useRef<HTMLDivElement>(null);
  const [sliding, setSliding] = useState<number | null>(null);

  // The canvas turns the wheel into panning; let the panel scroll instead.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const stop = (e: WheelEvent) => e.stopPropagation();
    node.addEventListener("wheel", stop);
    return () => node.removeEventListener("wheel", stop);
  });

  const targets = s.live.filter((el): el is StyledElement => s.selection.has(el.id) && isStyled(el));
  const toolKind = targets.length || !isShapeTool(s.tool) ? null : s.tool === "line" || s.tool === "arrow" ? "line" : "shape";
  if (s.drag || (!targets.length && !toolKind)) return null;

  /** The value shown for a property: the selection's (null when mixed), or the tool's. */
  const shown = <K extends StyleKey>(key: K): Style[K] | null | undefined => {
    if (toolKind) {
      if (key === "edges") return (s.tool === "rounded" ? "round" : "sharp") as Style[K];
      if ((key === "startHead" || key === "endHead") && s.tool === "line") return undefined;
      return STYLE_KEYS[toolKind].includes(key) ? s.newStyle[key] : undefined;
    }
    const values = new Set(targets.filter((el) => takesStyle(el, key)).map((el) => styleOf(el)[key]));
    if (!values.size) return undefined;
    return values.size === 1 ? ([...values][0] as Style[K]) : null;
  };

  const set = (patch: StylePatch) => {
    if (toolKind) {
      if (patch.edges) store.setTool(patch.edges === "round" ? "rounded" : "rectangle");
      store.setNewStyle(patch);
      return;
    }
    const st = store.state;
    const changes = st.live.flatMap((el) => (st.selection.has(el.id) && isStyled(el) ? (applyStyle(el, patch) ?? []) : []));
    store.commit(changes);
    // Edges belong to the shape kind, which the tool picks.
    if (!patch.edges) store.setNewStyle(patch);
  };

  const onlyText = targets.length > 0 && targets.every((el) => el.type === "text" || el.type === "note");
  const has = (key: StyleKey) => shown(key) !== undefined;
  /** For a property `has()` said is shown: its value, or null when mixed. */
  const val = <K extends StyleKey>(key: K) => shown(key) as Style[K] | null;
  const opacity = sliding ?? shown("opacity");

  return (
    <div
      ref={ref}
      role="region"
      aria-label={toolKind ? "Style for new shapes" : "Style"}
      className="absolute top-14 left-3 z-20 flex max-h-[calc(100%-8rem)] w-48 flex-col gap-3 overflow-y-auto rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {has("strokeColor") && (
        <Swatches label={onlyText ? "Text" : "Stroke"} colors={SKETCH_COLORS} value={val("strokeColor")} css={colorCss} onPick={(v) => set({ strokeColor: v })} />
      )}
      {has("fillColor") && (
        <Swatches label="Background" colors={FILL_COLORS} value={val("fillColor")} css={fillCss} onPick={(v) => set({ fillColor: v })} />
      )}
      {has("strokeWidth") && <Group label="Stroke width" options={WIDTHS} value={val("strokeWidth")} onPick={(v) => set({ strokeWidth: v })} />}
      {has("strokeStyle") && <Group label="Stroke style" options={STROKES} value={val("strokeStyle")} onPick={(v) => set({ strokeStyle: v })} />}
      {has("edges") && <Group label="Edges" options={EDGES} value={val("edges")} onPick={(v) => set({ edges: v })} />}
      {has("startHead") && <Group label="Start" options={START_HEADS} value={val("startHead")} onPick={(v) => set({ startHead: v })} />}
      {has("endHead") && <Group label="End" options={END_HEADS} value={val("endHead")} onPick={(v) => set({ endHead: v })} />}
      {has("fontFamily") && <Group label="Font" options={FONTS} value={val("fontFamily")} onPick={(v) => set({ fontFamily: v })} wide />}
      {has("fontSize") && <Group label="Font size" options={SIZES} value={val("fontSize")} onPick={(v) => set({ fontSize: v })} />}
      {has("fontWeight") && <Group label="Weight" options={WEIGHTS} value={val("fontWeight")} onPick={(v) => set({ fontWeight: v })} />}
      {has("textAlign") && <Group label="Align" options={ALIGNS} value={val("textAlign")} onPick={(v) => set({ textAlign: v })} />}
      {opacity !== undefined && (
        <div className="flex flex-col gap-1.5">
          <span id="sketch-opacity" className="text-[11px] font-medium text-muted-foreground">
            Opacity <span className="font-normal tabular-nums">{opacity === null ? "· mixed" : `${opacity}%`}</span>
          </span>
          <Slider
            aria-labelledby="sketch-opacity"
            min={0}
            max={100}
            step={10}
            value={[opacity ?? 100]}
            onValueChange={(v) => {
              const value = Array.isArray(v) ? v[0] : (v as number);
              setSliding(value);
              // Shows the change while sliding; it's written once, when the slider is let go.
              if (!toolKind) store.setPreview(targets.map((el) => applyStyle(el, { opacity: value }) ?? el));
            }}
            onValueCommitted={(v) => {
              const value = Array.isArray(v) ? v[0] : (v as number);
              setSliding(null);
              store.setPreview(null);
              set({ opacity: value });
            }}
          />
        </div>
      )}
      {!toolKind && (
        <div role="group" aria-label="Layers" className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Layers</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-xs" className="border border-border" title="Send to back (Ctrl+Shift+[)" aria-label="Send to back" onClick={() => arrange(store, "back")}>
              <SendToBackIcon />
            </Button>
            <Button variant="ghost" size="icon-xs" className="border border-border" title="Bring to front (Ctrl+Shift+])" aria-label="Bring to front" onClick={() => arrange(store, "front")}>
              <BringToFrontIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
