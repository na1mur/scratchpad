import { rectsIntersect, snap, type Point, type Rect } from "./layout";

/**
 * Where a pasted copy goes. Pasting is how a learner draws the next iteration of a loop, so a copy lands straight
 * below `below` (the copied selection, or the previous paste) with the same left edge and a gap between, and keeps
 * stepping down past anything already drawn there. Without `below` (after a cut) it goes back where it came from.
 */

export const PASTE_GAP = 48;
/** How far down a paste looks for free space before it settles where it is. */
const MAX_STEPS = 100;

const shift = (r: Rect, d: Point): Rect => ({ ...r, x: r.x + d.x, y: r.y + d.y });

/**
 * The offset to move a copy of `source` by. Offsets are whole grid steps, so elements stay on the grid. A spot
 * counts as taken when anything in `obstacles` comes within half a gap of it.
 */
export function pasteOffset(source: Rect, below: Rect | null, obstacles: readonly Rect[], gap = PASTE_GAP): Point {
  const offset = below ? { x: snap(below.x - source.x), y: snap(below.y + below.h + gap - source.y) } : { x: 0, y: 0 };
  const step = snap(source.h + gap);
  const m = gap / 2;
  for (let i = 0; i < MAX_STEPS; i++) {
    const at = shift(source, offset);
    const padded = { x: at.x - m, y: at.y - m, w: at.w + m * 2, h: at.h + m * 2 };
    if (!obstacles.some((r) => rectsIntersect(padded, r))) break;
    offset.y += step;
  }
  return offset;
}
