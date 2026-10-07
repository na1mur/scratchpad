# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **yarn** (classic, 1.22). Don't use npm/pnpm; `yarn.lock` is the source of truth.

- `yarn dev` — dev server at http://localhost:3000 (Turbopack)
- `yarn build` — production build; also runs the TypeScript check
- `yarn lint` — ESLint (flat config, `eslint.config.mjs`, extends `eslint-config-next` core-web-vitals + typescript). Note `next lint` no longer exists; the script calls `eslint` directly.
- `npx tsc --noEmit` — typecheck only
- `npx shadcn@latest add <component>` — add a UI component

There is no test runner configured yet.

## Stack and setup notes

- Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4 (no `tailwind.config`; theme lives in `src/app/globals.css`).
- **React Compiler is enabled** (`reactCompiler: true` in `next.config.ts`). Don't add manual `useMemo`/`useCallback`/`React.memo` for performance.
- All app code is under `src/`; import alias `@/*` → `src/*`.
- Route props use Next's global typed helpers (e.g. `LayoutProps<"/">` in `src/app/layout.tsx`) rather than hand-written prop types.
- The package name is `scratchpad` (the app's name is Scratchpad) because the folder name `DSABuddy` is invalid as an npm name. Scaffolding tools run directly in this folder will fail on that.

## shadcn/ui

Configured via `components.json` with the **`base-nova`** style, which is built on **Base UI** (`@base-ui/react`), not Radix. Keep that in mind when writing or adapting components: Base UI APIs differ from Radix (e.g. `render` prop instead of `asChild`), so don't paste Radix-based examples verbatim.

- Components are generated into `src/components/ui/`; aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- `cn()` comes from the `cn` npm package (a clsx + tailwind-merge replacement). `src/lib/utils.ts` just re-exports it, and generated components import from `"cn"` directly. `clsx` and `tailwind-merge` are intentionally not dependencies.
- Icons: `lucide-react`. Animations: `tw-animate-css`.
- Links styled as buttons use `buttonVariants()` on `next/link` rather than `<Button render={<Link/>}>` (Base UI warns about non-native buttons).

## Architecture notes

`PLAN.md` is the product spec and build plan; read it before larger changes.

- **Auth**: `src/proxy.ts` (Next 16's renamed middleware) only verifies the access JWT, never the DB. Route handlers wrap their body in `handle()` from `src/lib/api.ts`, which does the `Origin` CSRF check and turns `ApiError` into JSON. Use `requireUser({ onboarded: true })` and filter every query by the session's `userId`. Client code calls APIs through `api()`/`apiRaw()` in `src/lib/fetcher.ts`, which refreshes once on 401.
- **Visualization contract**: `src/lib/ai/schemas/vizSpec.ts`. The pipeline must output it and the renderers in `src/components/viz/` must consume only it. Model-facing schemas (flat, record-free) live in `src/lib/ai/schemas/pipeline.ts` and are converted in code.
- **AI SDK v7**: the system prompt option is `instructions` (not `system`), structured output is `generateText({ output: Output.object(...) })`, `streamText` parts come from `result.stream` and text deltas carry `part.text`. Check `node_modules/ai/docs/` before using other APIs.
- **Sandbox**: model-generated code runs only in `src/lib/ai/pipeline/sandbox.ts`: QuickJS in a per-run `worker_threads` worker (QuickJS can abort its WASM module on runaway recursion, so it must never run on the server thread). Never use `eval`, `Function` or `node:vm` for generated code.
- **Guardrail**: every diagnosis and chat answer goes through `revealsSolution()`; keep that when adding new model-written text the learner sees.
- Pipeline progress streams as SSE from `POST /api/problems/[id]/attempts`; status is also persisted per stage so a reload polls `GET /api/attempts/[id]`.
- Mongo: the `Problem` text index sets `language_override` because the `language` field holds values like `"python"` that MongoDB would otherwise reject as text-search languages.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
