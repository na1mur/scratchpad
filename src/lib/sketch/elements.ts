import type { NewElement, SketchElement } from "./types";

/** URL-safe random id. */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[b & 63]).join("");
}

export function randomNonce(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Places a new element: a fresh id (unless given), the order key, version 1. */
export function createElement(fields: NewElement, index: string, frameId: string | null = null): SketchElement {
  return {
    ...fields,
    id: fields.id ?? randomId(),
    index,
    version: 1,
    versionNonce: randomNonce(),
    updated: Date.now(),
    isDeleted: false,
    frameId,
  } as SketchElement;
}

type Locked = "id" | "type" | "version" | "versionNonce" | "updated";
export type ElementChanges<T extends SketchElement> = Partial<Omit<T, Locked>>;

/**
 * The element with `changes` applied, as a new object with a higher version. Every change goes through here,
 * so saving, undo and merging can tell what changed by its version alone.
 */
export function withChanges<T extends SketchElement>(el: T, changes: ElementChanges<T>): T {
  return { ...el, ...changes, version: el.version + 1, versionNonce: randomNonce(), updated: Date.now() };
}

/**
 * Whether `a` should replace `b` when two copies of one element meet (two tabs, or a save and the stored
 * sketch): the higher version wins, and on equal versions the lower nonce, so every side picks the same one.
 */
export function supersedes(a: SketchElement, b: SketchElement): boolean {
  return a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);
}

/** `current` with each incoming element that supersedes the copy there; also which ids it took. */
export function mergeElements(
  current: ReadonlyMap<string, SketchElement>,
  incoming: Iterable<SketchElement>,
): { merged: Map<string, SketchElement>; taken: string[] } {
  const merged = new Map(current);
  const taken: string[] = [];
  for (const el of incoming) {
    const existing = merged.get(el.id);
    if (!existing || supersedes(el, existing)) {
      merged.set(el.id, el);
      taken.push(el.id);
    }
  }
  return { merged, taken };
}
