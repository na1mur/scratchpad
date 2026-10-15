## Sketch: Build Plan

A structured canvas where the learner draws a problem the way they would on paper, with ready-made DSA elements, before or while writing an attempt. Status: proposal. Read `PLAN.md` first. This builds on the visualization contract (section 9) and the harness.

**Progress:** phase 1 (canvas core) is built. These parts of section 8 are still open: the workspace thumbnail and the `sketch` tour. Phase 1 also left out the note `codeLine` field, which phase 3 needs.

### 1. Product summary

Learners solve DSA problems by drawing the state: boxes for the array, arrows for `i` and `j`, nodes being relinked. Scratchpad only sees their thinking once it has become code. Sketch adds the step before that.

- **Elements carry meaning.** An array knows its cells, a pointer is attached to a cell or a node, and a list node has a `next` link. A drawing is data the pipeline can read, not pixels.
- **The problem picks the palette.** The harness signature says which elements matter (`ListNode`, `TreeNode`, `int[]`…), and "Start from case 1" lays out a fixed case's input.
- **Storyboard frames.** The learner draws the state at a few moments ("after the first swap", "when `fast` meets `slow`"), each frame a copy of the last with changes. Frames play back in the regular `Player`.
- **Prediction vs execution.** With an attempt, each frame is matched in code to a step of the real trace: "your frame 3 has `j` on index 4; your code moves it to 5". The analysis then separates two failures. A frame that disagrees with the trace means *the code doesn't do what you think*. Frames that agree with the trace while the answer is still wrong mean *the idea is wrong*. Nothing else gives the learner this.

Non-goals: a general whiteboard, real-time collaboration, editing on phones (view only), and drawing the *correct* behaviour for the learner (that would reveal the solution).

### 2. What we take from Excalidraw

Excalidraw (MIT; read at commit `4c37956`, Oct 2026) is a general canvas: free shapes, rough.js rendering, collaboration. We reimplement its core ideas in a much smaller form rather than embed it. Its embedding API can't add element *types* or renderers, so an array would be a group of rectangles tagged with `customData`, and the meaning we need would be lost.

| Excalidraw idea (where) | In Sketch |
| --- | --- |
| Flat, id-keyed, JSON-serializable element union discriminated on `type` (`packages/element/src/types.ts`) | **Take.** Semantic types are union members (`array`, `node`, `pointer`…), not `customData`. |
| `version` + `versionNonce` + `updated`, bumped by `newElementWith()` on every change; in-place `mutateElement()` only on hot paths (`mutateElement.ts`) | **Take.** Change detection, undo diffs and per-element merge on save all depend on it. Drag mutates a transient layer and commits once on pointer-up. |
| Fractional `index` for z-order: moves reindex only the moved elements (`fractionalIndex.ts`, `generateNKeysBetween`) | **Take.** Use the `fractional-indexing` npm package (CC0, the same code Excalidraw vendors). It also orders frames. |
| Soft delete (`isDeleted` tombstones) | **Take.** Undo and merging carry deletions. |
| `restoreElements()` as the trust boundary for any load or paste: default every field, repair bindings, fix order (`data/restore.ts`) | **Take**, as `restoreSketch()`. The server runs it too, on every save. |
| Store → `StoreDelta` → `History` with inverse deltas; `CaptureUpdateAction` (`IMMEDIATELY`/`NEVER`/`EVENTUALLY`) so drag ticks aren't each an undo step (`store.ts`, `delta.ts`, `history.ts`) | **Simplify.** A history entry is `{ id → { before, after } }` partials over changed elements, with the same capture modes. Undo applies the partials as new versions. |
| Two-sided bindings: arrow `startBinding`/`endBinding` plus target `boundElements`; `updateBoundElements()` recomputes arrow points after a move; `fixedPoint` ratios (`binding.ts`) | **Change.** A pointer stores a *semantic* anchor (`{ elementId, kind: "cell", index }`), and its geometry is computed at render from the target's layout, so nothing needs updating after a move. Back-references are derived from a map (there are few elements), not stored. |
| Text bound to a container through `containerId` | **Replace.** Values are fields of the element (cells, node value, entries). |
| Frames as `frameId` on the children; `addElementsToFrame` on drop, clipping, per-frame export (`frame.ts`) | **Take**, for storyboard frames. Adds "duplicate frame", which copies with fresh ids and keeps `originId`. |
| Library items: element arrays inserted through `duplicateAtSceneCoords` with fresh ids and remapped bindings (`App.addElementsFromPasteOrLibrary`) | **Take.** Palette items and "Start from case" are templates inserted the same way. Paste reuses the path. |
| Actions as `register({ perform(elements, appState) → { elements, appState, captureUpdate }, keyTest })` (`actions/`) | **Take.** One definition gives the shortcut, the toolbar button and the undo entry. |
| `viewportCoordsToSceneCoords` (`x = (clientX - left)/zoom - scrollX`) and its inverse; zoom-scaled hit tolerance | **Take** for pan/zoom and marquee selection. |
| Three stacked `<canvas>` layers, rough.js, `seed`, `ShapeCache`, per-element bitmap caches, culling | **Skip.** See section 4: DOM/SVG at our scale. |
| Collaboration, rooms, ephemeral increments | **Skip.** Keep only `reconcileElements()`'s per-element last-writer-wins (higher `version` wins, ties go to the lower `versionNonce`) for saves from two tabs. |
| Freedraw | **Replace** with `perfect-freehand` (MIT). |

If any Excalidraw code is copied rather than reimplemented, add its MIT notice to `NOTICE`.

**Alternatives considered** (checked against npm in Oct 2026):

- **Embed `@excalidraw/excalidraw` (0.18.1, React 19 supported).** This is the fastest way to a working board, but the semantics would be emulated: an array becomes a group of rectangles and text tagged with `customData`. Learners can ungroup it, resize one cell or type over a label, so every `onChange` would have to check and repair the structures. "Insert a cell" becomes a scene rebuild through `updateScene`. Render overrides only cover opacity and offset. The package ships its own Radix/Jotai interface and CSS next to Base UI and shadcn, a hand-drawn look, and a canvas that screen readers can't read. It also has to be imported client-side only.
- **Copy Excalidraw's code, or use `@excalidraw/element`/`math`/`common`.** These are published only as commit-hash prereleases (`0.18.0-f0063e113`), with no stable API. They're built around Excalidraw's closed element union, so a new element type touches bounds, collision, distance and render switches across the codebase. We'd be maintaining a fork of code built for problems we don't have.
- **Reimplement the ideas (chosen).** It's small, built for our elements, and fits the stack. The two pieces that stand alone come in as dependencies: `fractional-indexing` and `perfect-freehand`.

### 3. Data model

Client-safe types and Zod schemas live in `src/lib/sketch/types.ts`. The server validates every save with them.

```ts
type SketchElementBase = {
  id: string,
  type: SketchType,
  x: number, y: number,          // scene coordinates of the top-left corner
  index: string,                 // fractional z-order
  version: number, versionNonce: number, updated: number,
  isDeleted: boolean,
  frameId: string | null,
  originId?: string,             // the element this was duplicated from: keeps identity across frames
  locked?: boolean,
}

type Value = string | number | null

// Structures: one element each
array     { label, values: Value[], cellIds: string[], variant: "array" | "string" }
matrix    { label, rows: Value[][] }
hashmap   { label, entries: [string, string][] }
set       { label, values: string[] }
stack     { label, items: string[] }           // bottom first
queue     { label, items: string[] }           // front first
variables { vars: [name: string, value: string][] }

// Linked structures: nodes plus links
node      { variant: "list" | "tree" | "graph", value: Value }
link      { from: { elementId, port: "next" | "left" | "right" | "edge" },
            to: { elementId } | null,          // null: draws "null"
            weight?: number }

// Annotation
pointer   { name, target: Anchor | null }      // x, y: where the label sits
note      { text, codeLine?: number }          // sticky note; codeLine: a line of the attempt
text      { text, size: "s" | "m" | "l" }
freehand  { points: [x, y, pressure][], tone: "ink" | "blue" | "red" }
frame     { name, width, height, caseId?: string, codeLine?: number }

type Anchor =
  | { elementId, kind: "cell", index: number }               // array, string, stack, queue
  | { elementId, kind: "cellAt", row: number, col: number }  // matrix
  | { elementId, kind: "entry", key: string }                // hashmap, set, variables
  | { elementId, kind: "node" }

Sketch {                                       // src/models/Sketch.ts, one per user and problem
  userId, problemId (unique together),
  schemaVersion: 1,
  elements: SketchElement[],
  createdAt, updatedAt
}
```

Notes:

- **A pointer binds to an index, not a cell id.** It stands for an index variable, so inserting a cell before it doesn't move it. An index past the end is drawn hanging off the end in `pen-red` ("out of bounds"), which shows off-by-one thinking well. A pointer whose target was deleted becomes unbound (dashed) in the repair pass.
- **Links are separate elements, not node fields,** because relinking (reversing a list, rotating a tree) is what the learner draws. A node may have only one outgoing link per port. Adding a second replaces the first.
- **Camera state** (`scrollX`, `scrollY`, `zoom`) and the selection stay client-side and aren't saved.
- **Limits:** 400 live elements, 12 frames, 16 cells per array, 15 nodes per linked structure, and a 256 KB JSON document. `restoreSketch()` enforces them along with the Zod schema.

### 4. Rendering and interaction

**DOM and SVG, not `<canvas>`.** A sketch holds tens to a few hundred elements. One "world" `div` with `transform: translate(…) scale(zoom)` holds absolutely positioned elements as React components, with one SVG layer in the same world for links and pointer arrows. This is the tldraw approach. What it gives us:

- Hit testing is the browser's (`pointerdown` on the element). Arrows get a wide transparent stroke as a hit path. Geometric tests are only needed for marquee selection, which uses bounds.
- Text editing uses plain inputs inside cells: no WYSIWYG text engine.
- Tailwind tokens, dark mode and the landing page's paper palette (`bg-paper`, `text-ink`, `pen-blue`, `pen-red`, graph-paper background like `auth-specimen.tsx`) apply directly.
- Accessibility: every element has an accessible name ("Array nums, 4 cells, pointer i on index 1"), Tab cycles elements, Enter edits, arrow keys nudge, Delete removes.
- The interpreted state (section 6) renders with the existing `StructureView` renderers for previews.

**State.** A store outside React (`src/components/sketch/store.ts`, read through `useSyncExternalStore`) holds the elements, camera, selection, tool and history. Elements are immutable, so a component re-renders only when its own element object changes. React Compiler covers the rest (no manual memo). Pointer moves write to a transient `drag` overlay that is applied at render through CSS transforms, throttled to one update per frame (Excalidraw's `throttleRAF`). Pointer-up commits once, which makes one undo entry.

**Interaction model** (Excalidraw's pointer flow, smaller):

- Pointer-down records `{ origin, originalElements, hit }` and attaches window move/up listeners. The tools are `select`, `hand`, `pointer`, `link`, `note`, `text`, `freehand` and `frame`.
- Drag snaps to an 8 px grid. While a pointer head or link end is being dragged, the nearest valid anchor within 24 screen px glows (tolerance divided by zoom) and binds on release.
- Selecting a frame moves its children with it. Dropping an element into a frame sets `frameId`.
- Actions are defined in `src/lib/sketch/actions.ts`: delete, duplicate, duplicate frame, undo/redo, bring forward/back, insert/remove cell, add node after, start from case, zoom to fit. Each has `perform`, `keyTest` and `captureUpdate`.
- Copy/paste goes through the same template insertion as the palette, with fresh ids and remapped links and anchors.

### 5. Palette and seeding

`src/lib/sketch/palette.ts` builds the palette from what's known about the problem, without any model call:

1. **Harness signature** (`harnessView()`): `int[]`/`list<int>` → array; `string`/`char[]` → array (string variant); `int[][]`/`char[][]` → matrix; `ListNode` → list node and `next` link; `TreeNode` → tree node and `left`/`right` links; scalars → variables. Unsupported harnesses fall back to tags.
2. **Problem tags**: Hash Map → hashmap, Stack → stack, Queue/BFS → queue, Graph → graph node and edge, Two Pointers/Sliding Window/Binary Search → pointer listed first.
3. **Always there**: pointer, note, text, freehand, frame. Everything else sits under "More".

**Start from case** (`src/lib/sketch/seed.ts`) turns a fixed case's `argsJson` into elements with the harness runtime's conventions: arrays as cells, a list as nodes chained by `next` (with `harness.cycle`, the tail links to `pos`), a tree laid out level by level with `d3-hierarchy` (already a dependency), and scalars in a variables box. The result goes into a new frame named after the case, and the frame records `caseId`. Problems without a ready harness offer an empty palette only.

### 6. Interpreting a frame

`interpretFrame(elements, frameId) → { structures, state, pointers, notes, warnings }` (`src/lib/sketch/interpret.ts`, client-safe) reads a frame as `VizSpec` types, so the existing renderers and the trace comparison can use it:

- Each array, string, matrix, hashmap, set, stack, queue or variables element → one `Structure` and its `StructureState`. Cells keep `cellIds` as `ids`, so swaps animate.
- List nodes form one `linkedList` per group connected through `next` links. The head is the node with no incoming link, or the leftmost node in a cycle. A pointer named `head` decides when there's a choice.
- Tree nodes connected through `left`/`right` become one `tree`, rooted at the node with no parent. Graph nodes and edges become a `graph`, directed when its links have arrowheads.
- A pointer becomes `Pointer { structureId, name, index }` (cell index or node id).
- Structure ids follow `originId` back to the first frame, so one structure keeps its id across frames.
- `warnings` lists drawings that aren't valid structures: a node with two parents in a tree, an unattached pointer, a link to nothing. They show as quiet hints on the canvas and never block anything.

**Play my sketch**: frames in order become steps of a `CaseSpec` (`sketchCaseSpec()`): one step per frame with the frame name as its title and its notes as the explanation. It plays in the regular `Player`, so the learner can flip through their own storyboard.

### 7. Sketch and the analysis (phase 3)

- **Snapshot on submit.** The attempt form gets an "Include my sketch" switch, on when the sketch has frames. On submit, `Attempt.sketch` stores a copy of the live elements (capped as in section 3), so later edits don't rewrite history.
- **Matching in code** (`src/lib/sketch/compare.ts`). Each frame is matched to a step of the case it names (`caseId`, else the first case). Candidates are the steps on the frame's `codeLine` when set, otherwise all steps. The score is a structural distance: values per cell, pointer positions, list and tree links, with structures paired by label (the variable name), then by kind. Frames match steps in order, using a small alignment so frame *k* never matches an earlier step than frame *k−1*. The output is `{ frameId, stepId | null, diffs: { structureId, what, drawn, traced }[] }[]`. It is deterministic and costs no tokens. It is computed on the server for the prompt and again on the client for the UI.
- **Prompt.** `sketchBlock()` in `prompts/system.ts` renders the interpreted frames and the diffs as text (≤ 4k characters): "Frame 2 'after first swap' (line 4): nums = [1,3,2,4], i → 1, j → 2. Traced step c1-s9: j → 3." It goes to `understand` and `diagnose` and to the attempt chat. Add `<sketch>` to the "treat as data" list in `baseInstructions()` and `solutionInstructions()`. `DIAGNOSE_ROLE` gets one paragraph on the two failure modes from section 1. Everything the model writes still passes `revealsSolution()`.
- **UI.** The analysis gets a "Your sketch" tab. For each frame it shows the drawn state and the matched step side by side, both drawn with `StructureView`, with the differing cells or pointers in the `error` tone. Clicking a frame jumps the Player to its step (`(caseIndex, stepIndex)`, like the diagnosis links).

The comparison is only ever against the learner's own code. The hidden reference solution is never traced against the sketch, because that would reveal the solution.

### 8. Pages, APIs and files

- **Page**: `/problems/[slug]/sketch` (`src/app/(app)/problems/[slug]/sketch/page.tsx`), full screen like the Playground. A "Sketch" button sits beside the title on the workspace. A collapsible side panel shows the statement, the fixed test cases (with "Start from" per case) and, once an attempt exists, its code with line numbers, so notes and frames can point at lines. A thumbnail of the last frame shows on the workspace when a sketch exists.
- **API**: `GET` and `PUT /api/problems/[id]/sketch` (`handle()`, `requireUser({ onboarded: true })`, filtered by `userId`). The `PUT` body is `{ elements }`, and only changed elements are sent. The server runs `restoreSketch()`, merges per element by `version`/`versionNonce` against what's stored (so two tabs don't overwrite each other), and returns the merged elements. The client saves 1.5 s after the last commit and on `pagehide` (`sendBeacon`). Deleting a problem cascades to its sketch.
- **Phones**: below `md` the page is view-only (pan, zoom, play frames), with a note that editing needs a larger screen.
- **Tour**: a `sketch` tour (palette, start from case, duplicate frame, play) in `src/lib/tours.ts`, shown on first open.
- **Sharing**: shared attempt pages leave the sketch out at first.
- **Files**:
  - `src/lib/sketch/`: `types.ts`, `elements.ts` (`newElement`, `newElementWith`, ids), `order.ts`, `history.ts`, `restore.ts`, `layout.ts` (element sizes and anchor geometry), `palette.ts`, `seed.ts`, `interpret.ts`, `compare.ts`, `actions.ts`.
  - `src/components/sketch/`: `SketchCanvas.tsx` (camera and layers), `elements/*`, `Palette.tsx`, `Toolbar.tsx`, `FrameStrip.tsx`, `store.ts`.
  - `src/models/Sketch.ts` and `src/app/api/problems/[id]/sketch/route.ts`.
- **New dependencies**: `fractional-indexing` and `perfect-freehand`.

### 9. Build phases (in order, verify each before moving on)

1. **Canvas core.** The model, store, history, restore, the DOM/SVG renderer, pan/zoom, select/drag/marquee, keyboard actions, and the elements array, variables, hashmap, stack, queue, pointer, list node, tree node, link, note, text and freehand. The palette comes from the harness and tags, plus "Start from case". Saving and loading through the API.
   *Acceptance:* on Two Sum, the palette leads with array, pointer and hashmap. "Start from case 1" draws `nums` and `target`. A dragged pointer binds to a cell, and inserting a cell before it leaves it on the same index. Fifty mixed edits undo and redo exactly. A reload restores the sketch. Two tabs editing different elements both keep their edits. Dragging stays smooth with 300 elements.
2. **Storyboard.** Frames, duplicate frame with `originId`, the frame strip, `interpretFrame()` with warnings, and "Play my sketch" in the `Player`.
   *Acceptance:* a reverse-linked-list storyboard of 4 frames plays back with nodes animating between frames, and a tree with a node that has two parents shows a warning.
3. **Sketch in the analysis.** Snapshot on submit, `compare.ts`, `sketchBlock()` in understand, diagnose and chat, and the "Your sketch" tab.
   *Acceptance:* a two-pointer attempt whose code moves `j` one step further than the drawing makes the matching frame show the `j` difference. The diagnosis names that frame and says the code and the plan disagree. An attempt whose frames match the trace but which still fails is diagnosed as an idea problem. Nothing new gets past `revealsSolution()`.
4. **Later.** Graph nodes and edges in the palette, export to PNG/SVG, the sketch on shared pages, sketching beside a solution walkthrough, and turning a notebook photo into elements through the vision model (structured output in this schema, reviewed by the learner like the text extraction).

### 10. Open questions

- One sketch per problem (proposed, with snapshots per attempt) or one per attempt?
- Should notes be able to hold pseudo-code that becomes the attempt, or is the attempt editor the only place for code (proposed)?
- The name: "Sketch" fits Scratchpad, but it's close to the app's own name.
