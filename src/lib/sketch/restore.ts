import { bindOutline } from "./bindings";
import { randomId, supersedes, withChanges } from "./elements";
import { anchorShape, pointerLabelRect } from "./layout";
import { repairOrder, sortByOrder } from "./order";
import {
  MIN_SHAPE_SIZE,
  isCells,
  sketchElementSchema,
  type ElementOf,
  type LineBinding,
  type LinkPort,
  type NodeVariant,
  type SketchElement,
} from "./types";

/**
 * The trust boundary for anything loaded, pasted or saved: drops elements that don't fit the schema, keeps the
 * newer copy of a duplicated id, and repairs what the schema can't express (links and pointers to elements that
 * are gone, cell ids out of step with the values, order keys that collide, shapes too small to grab, lines with
 * no length, arrows attached to elements that are gone). Repairs are ordinary changes with a
 * higher version, so every tab adopts them. Runs the same on the client and the server.
 */

const PORTS: Record<NodeVariant, readonly LinkPort[]> = {
  list: ["next"],
  tree: ["left", "right"],
  graph: ["edge"],
};

export type RestoreResult = {
  /** Every element, deletions included, in drawing order. */
  elements: SketchElement[];
  /** How many elements changed in the repair. */
  repaired: number;
  /** How many inputs weren't elements at all. */
  dropped: number;
};

/**
 * The inputs that are elements, one per id (the newer copy). No repairs: those need the whole sketch, so a save
 * parses its changes with this, merges them into the stored sketch, and then restores the result.
 */
export function parseElements(input: readonly unknown[]): { elements: Map<string, SketchElement>; dropped: number } {
  const byId = new Map<string, SketchElement>();
  let dropped = 0;
  for (const raw of input) {
    const parsed = sketchElementSchema.safeParse(raw);
    if (!parsed.success) {
      dropped++;
      continue;
    }
    const existing = byId.get(parsed.data.id);
    if (!existing || supersedes(parsed.data, existing)) byId.set(parsed.data.id, parsed.data);
  }
  return { elements: byId, dropped };
}

export function restoreElements(input: readonly unknown[]): RestoreResult {
  const { elements: byId, dropped } = parseElements(input);

  const repairedIds = new Set<string>();
  const put = (el: SketchElement) => {
    byId.set(el.id, el);
    repairedIds.add(el.id);
  };

  for (const el of byId.values()) {
    if (isCells(el)) {
      const ids = fixCellIds(el.values.length, el.cellIds);
      if (ids) put(withChanges(el, { cellIds: ids }));
    }
    // Storyboard frames aren't drawn yet, so no element can belong to one.
    if (el.frameId !== null) put(withChanges(byId.get(el.id)!, { frameId: null }));
    // A shape too small to grab grows to the smallest size the canvas draws.
    if (el.type === "shape" && (el.w < MIN_SHAPE_SIZE || el.h < MIN_SHAPE_SIZE)) {
      const shape = byId.get(el.id) as ElementOf<"shape">;
      put(withChanges(shape, { w: Math.max(MIN_SHAPE_SIZE, shape.w), h: Math.max(MIN_SHAPE_SIZE, shape.h) }));
    }
    // A line whose points all coincide can't be seen or clicked.
    if (el.type === "line" && !el.isDeleted && el.points.every(([x, y]) => x === el.points[0][0] && y === el.points[0][1])) {
      put(withChanges(byId.get(el.id)!, { isDeleted: true }));
    }
  }

  const liveNode = (id: string) => {
    const el = byId.get(id);
    return el && !el.isDeleted && el.type === "node" ? el : null;
  };

  // Links: both ends must be live nodes of one kind, on a port that kind has, and a node has one link per
  // port (graph nodes: one per neighbour). The newest wins.
  const links = [...byId.values()].filter((el): el is ElementOf<"link"> => el.type === "link" && !el.isDeleted);
  links.sort((a, b) => b.updated - a.updated || (a.id < b.id ? -1 : 1));
  const usedPorts = new Set<string>();
  for (const link of links) {
    const from = liveNode(link.from.elementId);
    const to = link.to ? liveNode(link.to.elementId) : null;
    const valid =
      from &&
      PORTS[from.variant].includes(link.from.port) &&
      (link.to === null ? from.variant !== "graph" : to && to.id !== from.id && to.variant === from.variant);
    const slot = from?.variant === "graph" ? `${link.from.elementId}>${link.to?.elementId}` : `${link.from.elementId}.${link.from.port}`;
    if (!valid || usedPorts.has(slot)) {
      put(withChanges(link, { isDeleted: true }));
      continue;
    }
    usedPorts.add(slot);
  }

  // Pointers whose target is gone keep pointing at the empty space above their name.
  for (const el of byId.values()) {
    if (el.type !== "pointer" || el.isDeleted || !el.target) continue;
    if (!anchorShape(byId, el.target)) {
      const label = pointerLabelRect(el);
      put(withChanges(el, { target: null, end: { x: label.x + label.w / 2, y: label.y - 40 } }));
    }
  }

  // Arrow ends attached to elements that are gone, or that take no arrows, come loose where they are.
  for (const el of byId.values()) {
    if (el.type !== "line" || el.isDeleted || (!el.startBinding && !el.endBinding)) continue;
    const holds = (b: LineBinding | null | undefined) => {
      const target = b && byId.get(b.elementId);
      return Boolean(target && target.id !== el.id && bindOutline(target));
    };
    const start = holds(el.startBinding);
    const end = holds(el.endBinding);
    if ((el.startBinding && !start) || (el.endBinding && !end)) {
      put(withChanges(el, { startBinding: start ? el.startBinding : null, endBinding: end ? el.endBinding : null }));
    }
  }

  for (const el of repairOrder(sortByOrder(byId.values()))) put(el);

  return { elements: sortByOrder(byId.values()), repaired: repairedIds.size, dropped };
}

/** Cell ids that match `count` values and are unique, or null when `ids` already are. */
function fixCellIds(count: number, ids: readonly string[]): string[] | null {
  const unique = new Set(ids);
  if (ids.length === count && unique.size === count) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = ids[i];
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    } else {
      out.push(randomId());
    }
  }
  return out;
}
