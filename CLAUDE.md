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

- **Brand accent** (mint) tokens live in `src/app/globals.css`: `bg-brand`/`border-brand`/`ring-brand` for fills, borders and focus; `text-brand-foreground` on top of `bg-brand`; `text-brand-strong` for accent text or icons (plain `brand` is too pale as text on light backgrounds); `bg-brand-soft` for a tint. Use these on new or reworked pages instead of hard-coded colors. `--accent` is shadcn's neutral hover surface, not the brand color. The landing page's ink/paper/pen palette is separate (`bg-paper`, `text-ink`, `pen-blue`, `pen-red`).

## shadcn/ui

Configured via `components.json` with the **`base-nova`** style, which is built on **Base UI** (`@base-ui/react`), not Radix. Keep that in mind when writing or adapting components: Base UI APIs differ from Radix (e.g. `render` prop instead of `asChild`), so don't paste Radix-based examples verbatim.

- Components are generated into `src/components/ui/`; aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- `cn()` comes from the `cn` npm package (a clsx + tailwind-merge replacement). `src/lib/utils.ts` just re-exports it, and generated components import from `"cn"` directly. `clsx` and `tailwind-merge` are intentionally not dependencies.
- Icons: `lucide-react`. Animations: `tw-animate-css`.
- Links styled as buttons use `buttonVariants()` on `next/link` rather than `<Button render={<Link/>}>` (Base UI warns about non-native buttons).

## Architecture notes

`PLAN.md` is the product spec and build plan; read it before larger changes.

- **Auth**: `src/proxy.ts` (Next 16's renamed middleware) only verifies the access JWT, never the DB. Route handlers wrap their body in `handle()` from `src/lib/api.ts`, which does the `Origin` CSRF check and turns `ApiError` into JSON. Use `requireUser({ onboarded: true })` and filter every query by the session's `userId`. Client code calls APIs through `api()`/`apiRaw()` in `src/lib/fetcher.ts`, which refreshes once on 401 (and reloads to `/login` if that fails); pass `skipRefresh: true` where a 401 is an expected answer, as with a wrong password at login.
- **Email + OTP + Google**: signup creates the user with `emailVerified: false` and emails a 6-digit code (`src/lib/auth/otp.ts`: HMAC-hashed, 5 attempts, 10 min, one live code per user and purpose in `OtpCode`); `/api/auth/verify-email` consumes it and starts the session. Password reset reuses the code flow (`/api/auth/password/{forgot,reset}`). `emailVerified` is only ever an explicit `false` for unverified accounts, so users from before verification existed count as verified (`isUnverified()`). Mail goes through `src/lib/email/mailer.ts` (nodemailer/SMTP; with no `SMTP_USER`/`SMTP_PASS` it prints to the console in dev). Google login is `src/app/api/auth/google/{route,callback/route}.ts` with `arctic`; the callback links by `googleId`, then by verified email, else creates a password-less user. Linking onto an *unverified* password account drops that password. Responses that depend on whether an email has an account must stay identical (see `forgot`/`resend`).
- **Auth pages** (`src/app/(auth)/`): the layout puts the logo and theme toggle in the screen corners on the landing page's paper palette. Each page wraps its form in `AuthScreen` (`auth-screen.tsx`), which splits 50/50 from `lg` up: the form in one half and a problem-solving trace (`auth-specimen.tsx`, a different one per page) on graph paper in the other, with `designSide` choosing which. On phones the design is hidden and the form is centred. Keep the form on the same side across related pages (login and forgot-password, signup and verify-email). Shared control classes and `AuthHeading`/`FormAlert` are in `auth-ui.tsx`; whole-form errors go in `FormAlert` (inline, `role="alert"`), not only a toast. Fields are disabled while submitting, so refocus a field only after `busy` clears (see the `focusCode` effects). Trace notes ask a question or point at the step and never state the fix.
- **Avatars**: `User.googlePicture` (Google's URL, refreshed on every Google login) and `User.avatarKey` (R2 object the user uploaded, under `users/<id>/avatar/`). `resolveAvatarUrl()` in `src/lib/avatar.ts` picks the upload, then Google's picture, else `null` (UI shows the user icon via `UserAvatar`). Uploads: the browser square-crops and shrinks the image, PUTs it to a presigned URL from `/api/settings/avatar/presign`, then `PUT /api/settings/avatar` verifies the object and deletes the previous one. The profile page is `/profile`.
- **Legal pages**: `/privacy-policy` and `/terms-of-service` render the markdown in `data/` through `LegalPage` (`src/components/legal-page.tsx`: react-markdown + remark-gfm + rehype-slug, styled with the `@tailwindcss/typography` plugin loaded in `globals.css`). Both are in `PUBLIC_PAGES` in `src/proxy.ts` (Google's reviewers must reach them signed out) and linked from the landing footer. Edit the `.md` files to change the text; the contact email lives in them.
- **Visualization contract**: `src/lib/ai/schemas/vizSpec.ts`. The pipeline must output it and the renderers in `src/components/viz/` must consume only it. Model-facing schemas (flat, record-free) live in `src/lib/ai/schemas/pipeline.ts` and are converted in code.
- **AI SDK v7**: the system prompt option is `instructions` (not `system`), structured output is `generateText({ output: Output.object(...) })`, `streamText` parts come from `result.stream` and text deltas carry `part.text`. Check `node_modules/ai/docs/` before using other APIs.
- **Sandbox**: model-generated code runs only in `src/lib/ai/pipeline/sandbox.ts`: QuickJS in a per-run `worker_threads` worker (QuickJS can abort its WASM module on runaway recursion, so it must never run on the server thread). Never use `eval`, `Function` or `node:vm` for generated code.
- **Guardrail**: every diagnosis and attempt-chat answer goes through `revealsSolution()`; keep that when adding new model-written text the learner sees. The one deliberate exception is the solutions feature below.
- **Solutions** (`/problems/[id]/solution`): opt-in worked solutions, versioned per problem in `Solution` (`src/models/Solution.ts`). The workspace's Solution button asks "try once more?" before the first one exists, then just links to the page; existing solutions are loaded from the DB, never regenerated. v1 builds on the newest analysed attempt (fix the details, or the closest correct approach); later versions answer a request (`different_approach`, `better_time`, `better_space`, `custom`) and are told about the existing ones. `POST /api/problems/[id]/solutions` returns at once and runs `runSolutionPipeline()` (`src/lib/ai/pipeline/solution.ts`) in `after()`. Its progress goes over the same event bus as attempts (`SolutionEvent` in `events.ts`), and the page follows it with `GET /api/solutions/[id]/events`, an SSE stream any page can open (so it works after navigating from the workspace or reloading). Each heartbeat re-reads the stored status so the stream also ends for a run in another process or a dead one; the page polls `GET /api/solutions/[id]` only if the stream drops early. Pipeline: solve (code, line notes, complexity, test input, expected return) → translate to instrumented JS and run in the sandbox (re-solve once if the result disagrees; `content.verified` records it) → narrate, with simulation as the fallback. The walkthrough is a plain VizSpec (verdict `works`, empty diagnosis); the rest is `SolutionContent` (`src/lib/ai/schemas/solution.ts`). These prompts use `solutionInstructions()` instead of `baseInstructions()`, so they omit `TUTOR_GUARDRAIL`. Solution chat shares `Message` (via `solutionId`) and `ChatPanel`; its `proposeSolution` tool only suggests a new version, which the learner confirms in `NewSolutionDialog`.
- **Problem link text**: when a problem has a `sourceUrl`, `src/lib/problemSource.ts` fetches the page on the server (LeetCode through its GraphQL API, anything else as HTML turned into text with cheerio) and stores `Problem.sourceText` and `sourceFetchedAt`. It's fetched in `after()` on create, and again when the URL is edited; the pipelines call `ensureProblemSource()` in case that hasn't happened yet. It reaches the model as a `<source>` block (`sourceBlock()` in `prompts/system.ts`) next to `<problem>`. The fetcher is a learner-controlled server-side request, so keep its guards: the address is checked at connect time through a custom `lookup` (no private, loopback or link-local ranges), ports 80/443 only, at most 3 redirects, 8 s, 2 MB.
- **Reference solutions**: `src/lib/problemReference.ts` finds known solutions on the web and stores them on `Problem.references` (one entry per language; an empty entry records a miss and is retried after a day; editing the title or link clears them). LeetCode links map the slug to the doocs/leetcode repo on GitHub (no key; CC BY-SA, so the solution page credits sources from `SolutionContent.references`); anything else uses Tavily search when `TAVILY_API_KEY` is set. The search never holds up a run: 6 s timeout, and a refusal (quota 432/433, bad key 401, rate limit 429) or outage pauses it in-process and isn't stored as a miss, so the run continues without a reference and a later one retries. It's a research step in code, not a model tool, because most of the BYOK providers have no web search and tool loops don't combine reliably with `Output.object`. The text reaches the model as `<reference_solutions>` (`referenceBlock()`) in the solution `solve` stage and the attempt `understand`/`diagnose` stages only, never in chat; tutor calls get `TUTOR_REFERENCE_NOTE`, and `revealsSolution()` still guards everything the learner sees. Fetches go through `safeRequest` from `problemSource.ts`.
- Pipeline progress streams as SSE from `POST /api/problems/[id]/attempts`; status is also persisted per stage so a reload polls `GET /api/attempts/[id]`.
- Mongo: the `Problem` text index sets `language_override` because the `language` field holds values like `"python"` that MongoDB would otherwise reject as text-search languages.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
