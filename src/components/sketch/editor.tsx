"use client";

import { useRef, useState } from "react";
import { addEntry, insertCell, setCell, setEntry, setMatrixCell, type Changes } from "@/lib/sketch/actions";
import { withChanges } from "@/lib/sketch/elements";
import {
  LABEL_H,
  SHAPE_LINE_HEIGHT,
  cellRect,
  elementBounds,
  fittedShapeHeight,
  matrixCellRect,
  noteMetrics,
  pointerLabelRect,
  shapeTextHeight,
  shapeTextRect,
  tableColumns,
  tableRowRect,
  textMetrics,
  type ElementMap,
  type Rect,
} from "@/lib/sketch/layout";
import { styleOf } from "@/lib/sketch/style";
import {
  MAX_CELLS,
  MAX_ENTRIES,
  MAX_LABEL_LENGTH,
  MAX_POINTER_NAME,
  MAX_TEXT_LENGTH,
  MAX_VALUE_LENGTH,
  isCells,
  isTable,
  type SketchElement,
} from "@/lib/sketch/types";
import { textCss } from "./elements";
import type { EditTarget, SketchStore } from "./store";

/** Where the editor sits, what it starts with and how long the text may be; null when the target is gone. */
function describe(el: SketchElement, target: EditTarget): { rect: Rect; value: string; max: number; multiline: boolean } | null {
  switch (target.kind) {
    case "cell":
      return isCells(el) && target.index < el.values.length
        ? { rect: cellRect(el, target.index), value: el.values[target.index], max: MAX_VALUE_LENGTH, multiline: false }
        : null;
    case "matrixCell":
      return el.type === "matrix" && el.rows[target.row]?.[target.col] !== undefined
        ? { rect: matrixCellRect(el, target.row, target.col), value: el.rows[target.row][target.col], max: MAX_VALUE_LENGTH, multiline: false }
        : null;
    case "entry": {
      if (!isTable(el) || !el.entries[target.row]) return null;
      const row = tableRowRect(el, target.row);
      const { keyW } = tableColumns(el);
      const rect = target.part === 0 ? { ...row, w: keyW } : { ...row, x: row.x + keyW, w: Math.max(row.w - keyW, 80) };
      return { rect, value: el.entries[target.row][target.part], max: MAX_VALUE_LENGTH, multiline: false };
    }
    case "label":
      return "label" in el ? { rect: { x: el.x, y: el.y, w: 160, h: LABEL_H }, value: el.label, max: MAX_LABEL_LENGTH, multiline: false } : null;
    case "value": {
      if (el.type !== "node") return null;
      const b = elementBounds(el)!;
      return { rect: { ...b, w: Math.max(b.w, 64) }, value: el.value, max: MAX_VALUE_LENGTH, multiline: false };
    }
    case "name": {
      if (el.type !== "pointer") return null;
      const r = pointerLabelRect(el);
      return { rect: { ...r, w: Math.max(r.w, 72) }, value: el.name, max: MAX_POINTER_NAME, multiline: false };
    }
    case "text": {
      // A shape's text is typed where it's drawn; the editor's height follows the text (see InlineEditor).
      if (el.type === "shape") return { rect: shapeTextRect(el), value: el.text, max: MAX_TEXT_LENGTH, multiline: true };
      if (el.type !== "note" && el.type !== "text") return null;
      const b = elementBounds(el)!;
      return { rect: { ...b, w: Math.max(b.w, 200), h: Math.max(b.h, 60) }, value: el.text, max: MAX_TEXT_LENGTH, multiline: true };
    }
  }
}

/** The editor's font: the element's own, so typing looks like the result. */
function editorFont(el: SketchElement): React.CSSProperties {
  switch (el.type) {
    case "text": {
      const s = styleOf(el);
      return textCss(s, textMetrics(s));
    }
    case "note":
      return textCss(styleOf(el), noteMetrics(el));
    case "shape": {
      const s = styleOf(el);
      return textCss(s, textMetrics(s, SHAPE_LINE_HEIGHT));
    }
    default:
      return { fontSize: 13 };
  }
}

/** The changes that typing `value` into `target` makes. */
function applyEdit(elements: ElementMap, el: SketchElement, target: EditTarget, value: string): Changes {
  switch (target.kind) {
    case "cell":
      return isCells(el) ? setCell(el, target.index, value) : [];
    case "matrixCell":
      return el.type === "matrix" ? setMatrixCell(el, target.row, target.col, value) : [];
    case "entry":
      return isTable(el) ? setEntry(elements, el, target.row, target.part, value) : [];
    case "label":
      return "label" in el && el.label !== value ? [withChanges(el, { label: value })] : [];
    case "value":
      return el.type === "node" && el.value !== value ? [withChanges(el, { value })] : [];
    case "name": {
      const name = value.trim();
      return el.type === "pointer" && name && name !== el.name ? [withChanges(el, { name })] : [];
    }
    case "text":
      if (el.type === "text" && !value.trim()) return [withChanges(el, { isDeleted: true })];
      // A shape keeps its size unless the text needs more height, and stays when its text is cleared.
      if (el.type === "shape") return el.text !== value ? [withChanges(el, { text: value, h: fittedShapeHeight(el, value) })] : [];
      return (el.type === "note" || el.type === "text") && el.text !== value ? [withChanges(el, { text: value })] : [];
  }
}

/** Where Tab goes from `target`: the next cell or entry, adding one at the end when there's room. */
function nextTarget(store: SketchStore, target: EditTarget, back: boolean): EditTarget | null {
  const el = store.state.elements.get(target.elementId);
  if (!el) return null;
  if (target.kind === "cell" && isCells(el)) {
    const index = target.index + (back ? -1 : 1);
    if (index < 0) return null;
    if (index >= el.values.length) {
      if (el.values.length >= MAX_CELLS) return null;
      store.commit(insertCell(el, el.values.length));
    }
    return { ...target, index };
  }
  if (target.kind === "matrixCell" && el.type === "matrix") {
    const cols = el.rows[0].length;
    const flat = target.row * cols + target.col + (back ? -1 : 1);
    if (flat < 0 || flat >= el.rows.length * cols) return null;
    return { ...target, row: Math.floor(flat / cols), col: flat % cols };
  }
  if (target.kind === "entry" && isTable(el)) {
    if (back) return target.part === 1 ? { ...target, part: 0 } : target.row > 0 ? { ...target, row: target.row - 1, part: 1 } : null;
    if (target.part === 0) return { ...target, part: 1 };
    if (target.row + 1 >= el.entries.length) {
      if (el.entries.length >= MAX_ENTRIES) return null;
      store.commit(addEntry(el));
    }
    return { ...target, row: target.row + 1, part: 0 };
  }
  return null;
}

/** A text box over the part being edited. Enter (or Escape, in notes) finishes; Tab moves along a structure. */
export function InlineEditor({ store, target, element }: { store: SketchStore; target: EditTarget; element: SketchElement }) {
  const spec = describe(element, target);
  const [value, setValue] = useState(spec?.value ?? "");
  // Set once a key has finished the edit, so the blur that follows doesn't finish it again.
  const done = useRef(false);
  if (!spec) return null;

  const commit = (then: EditTarget | null) => {
    if (done.current) return;
    done.current = true;
    const el = store.state.elements.get(target.elementId);
    if (el && !el.isDeleted) store.commit(applyEdit(store.state.elements, el, target, value.slice(0, spec.max)));
    store.setEditing(then);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      if (spec.multiline) commit(null);
      else {
        done.current = true;
        store.setEditing(null);
      }
    } else if (e.key === "Enter" && (!spec.multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit(null);
    } else if (e.key === "Tab" && !spec.multiline) {
      e.preventDefault();
      done.current = true;
      // Write this value first, so the next target is worked out from the updated element.
      const el = store.state.elements.get(target.elementId);
      if (el) store.commit(applyEdit(store.state.elements, el, target, value.slice(0, spec.max)));
      store.setEditing(nextTarget(store, target, e.shiftKey));
    }
  };

  const className = "absolute z-30 rounded-sm border-2 border-brand bg-paper px-1.5 font-mono text-[13px] text-ink shadow-md outline-none";
  const style = { left: spec.rect.x, top: spec.rect.y, width: spec.rect.w, height: spec.rect.h };
  const handlers = {
    value,
    autoFocus: true,
    maxLength: spec.max,
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onKeyDown,
    onBlur: () => commit(null),
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select(),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    "aria-label": "Edit",
    "data-export-skip": "",
  };
  if (element.type === "shape") {
    // Centred on the shape's text area at the height the text takes, without a box: the shape is the box.
    const m = textMetrics(styleOf(element), SHAPE_LINE_HEIGHT);
    const h = Math.max(m.lineH, shapeTextHeight(element, value || " "));
    const w = Math.max(spec.rect.w, m.px * 3);
    return (
      <textarea
        {...handlers}
        className="absolute z-30 resize-none overflow-hidden border-0 bg-transparent p-0 break-words outline-none"
        style={{ left: spec.rect.x + (spec.rect.w - w) / 2, top: spec.rect.y + (spec.rect.h - h) / 2, width: w, height: h, ...editorFont(element) }}
      />
    );
  }
  if (spec.multiline) {
    return <textarea {...handlers} className={`${className} resize-none py-1.5`} style={{ ...style, ...editorFont(element) }} />;
  }
  return <input {...handlers} className={`${className} text-center`} style={style} />;
}
