import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { withChanges } from "./elements";
import type { SketchElement } from "./types";

/**
 * Drawing order. Each element's `index` is a fractional key (base 62, compared as plain strings, never with
 * localeCompare), so moving or adding elements gives new keys to those elements only and two tabs never
 * renumber each other's work. Ties, which only a merge can create, fall back to the id.
 */

export function compareOrder(a: SketchElement, b: SketchElement): number {
  if (a.index !== b.index) return a.index < b.index ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByOrder<T extends SketchElement>(elements: Iterable<T>): T[] {
  return [...elements].sort(compareOrder);
}

/** `n` keys after `last` (null: from the start). */
export function keysAfter(last: string | null, n: number): string[] {
  return generateNKeysBetween(last, null, n);
}

/** `n` keys before `first` (null: from the start). */
export function keysBefore(first: string | null, n: number): string[] {
  return generateNKeysBetween(null, first, n);
}

function isValidKey(key: string): boolean {
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gives a new key to every element whose key is malformed or not above the one before it (a duplicate from a
 * merge), keeping the order the list is in. Returns only the elements it changed.
 */
export function repairOrder(sorted: readonly SketchElement[]): SketchElement[] {
  const changed: SketchElement[] = [];
  let prev: string | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const el = sorted[i];
    if (isValidKey(el.index) && (prev === null || el.index > prev)) {
      prev = el.index;
      continue;
    }
    // The next element that's still in order bounds the new key.
    let upper: string | null = null;
    for (let j = i + 1; j < sorted.length; j++) {
      const k = sorted[j].index;
      if (isValidKey(k) && (prev === null || k > prev)) {
        upper = k;
        break;
      }
    }
    const index = generateKeyBetween(prev, upper);
    changed.push(withChanges(el, { index }));
    prev = index;
  }
  return changed;
}
