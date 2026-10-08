## Scratchpad: Build Plan

### 1. Product summary

A web app where a learner pastes pseudo-code and their reasoning for a DSA problem, or uploads a photo of their notebook. An AI agent works out what they're trying to do, simulates their approach on a small input, and shows a step-by-step animated visualization of execution, including each loop iteration. It then explains why the approach fails, if it does. The AI never volunteers the solution: it points out where the reasoning breaks and nudges how to think about the problem. A learner who wants the solution can ask for it explicitly (section 11a). Users bring their own API key (OpenAI, Anthropic, Google, xAI, and a dozen more; see `src/lib/providers.ts`).

### 2. Tech stack

**Core:** Next.js (App Router, latest stable, full-stack with Route Handlers and Server Actions), TypeScript (strict), Tailwind CSS, shadcn/ui, React Hook Form + Zod, Vercel AI SDK, Mongoose with a local MongoDB.

**Additional libraries:**

- **AI providers:** `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@openrouter/ai-sdk-provider`.
- **Auth:** `jose` for JWT (works in middleware/edge and Node) and `bcryptjs` or `argon2` for password hashing.
- **Animation:** `motion` (Framer Motion).
- **Layout:** `d3-hierarchy` for tree layout. Use a simple circular layout or `dagre` for graphs.
- **Storage:** `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for Cloudflare R2.
- **Sandbox:** `quickjs-emscripten` for the sandboxed trace execution described in section 8.
- **Code editor:** optionally `@uiw/react-codemirror` with line numbers, so the visualization can highlight the active line. Otherwise use a shadcn Textarea with a line-number gutter.

Use the latest AI SDK and check its docs for the current structured-output API. It is either `generateObject`/`streamObject` or `generateText` with an output schema, depending on version.

### 3. Environment variables

```
MONGODB_URI=mongodb://127.0.0.1:27017/dsa-viz
JWT_ACCESS_SECRET=            # 32+ random bytes
JWT_REFRESH_SECRET=           # different 32+ random bytes
ENCRYPTION_KEY=               # 32 bytes, base64 (AES-256-GCM)
ENCRYPTION_KEY_VERSION=1
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
APP_URL=http://localhost:3000
```

Validate all of these with a Zod schema in `src/lib/env.ts` at startup and fail fast if any are missing.

### 4. Project structure

```
src/
  app/
    (auth)/login, (auth)/signup
    onboarding/language, onboarding/provider
    problems/page.tsx              # list: tag tabs, search, pagination
    problems/new/page.tsx          # statement + optional tags
    problems/[id]/page.tsx         # workspace
    settings/page.tsx
    api/
      auth/{signup,login,logout,refresh,me,verify-email,verify-email/resend,password/forgot,password/reset,google,google/callback}/route.ts
      settings/{language,provider,provider/test,models}/route.ts
      problems/route.ts, problems/[id]/route.ts
      problems/[id]/attempts/route.ts                # create + process (streams progress)
      attempts/[id]/route.ts
      attempts/[id]/messages/route.ts                # follow-up questions
      uploads/presign/route.ts, uploads/extract/route.ts
  components/
    ui/ (shadcn)
    viz/ Player.tsx, CodePane.tsx, ExplanationPanel.tsx,
         renderers/{ArrayView,StringView,HashMapView,SetView,StackView,
                    QueueView,LinkedListView,TreeView,GraphView,MatrixView,VariablesView}.tsx
  lib/
    env.ts, db.ts, crypto.ts, auth/{jwt.ts,cookies.ts,session.ts,password.ts}
    ai/{providers.ts, prompts/*.ts, pipeline/*.ts, schemas/vizSpec.ts}
    r2.ts, tags.ts, rateLimit.ts
  models/ User.ts, RefreshToken.ts, Problem.ts, Attempt.ts, Message.ts
  middleware.ts   # named proxy.ts in Next.js 16+
```

### 5. Authentication and authorization

1. **Signup and login.** Email and password, validated with Zod: a valid email and a password of at least 8 characters. Hash passwords with argon2id or bcrypt (cost 12). New accounts are unverified until they enter a 6-digit code emailed to them (nodemailer over SMTP); no session is issued before that. Password reset uses the same kind of code. "Continue with Google" (OAuth 2.0 + PKCE via `arctic`) is offered on both login and signup and links to an existing account with the same verified email.
2. **Access token.** A JWT valid for 15 minutes, with payload `{ sub: userId, onboardingStep }`.
3. **Refresh token.** A JWT valid for 7 days, with payload `{ sub, jti, family }`. Store only a SHA-256 hash of each refresh token in the `RefreshToken` collection, along with `userId`, `family`, `expiresAt`, `revokedAt`, and `replacedBy`. Add a TTL index on `expiresAt`.
4. **Rotation.** Every call to `/api/auth/refresh` revokes the old token and issues a new pair. If a revoked token is ever presented again (reuse), revoke the entire family. This defends against token theft.
5. **Cookies.** Both tokens go in cookies set with `httpOnly`, `secure: NODE_ENV === 'production'`, and `sameSite: 'lax'`. The access token cookie uses `path: '/'`. The refresh token cookie uses `path: '/api/auth'` so it is only sent to the auth routes.
6. **Middleware.** It verifies the access token with `jose` only; it never touches the database. If the token is missing or expired on a page route, redirect to `/api/auth/refresh?next=<path>`. That endpoint rotates the tokens and redirects back, or sends the user to `/login`. API routes return 401, and the client fetch wrapper retries once after calling `/api/auth/refresh`.
7. **Onboarding gate.** If onboarding isn't complete, redirect to the correct onboarding step.
8. **CSRF.** On every POST, PATCH, or DELETE, check that the `Origin` header matches `APP_URL`. Together with `sameSite=lax`, this is enough for now.
9. **Ownership.** Every data query filters by `userId` taken from the verified token, never from request input.

### 6. Onboarding

**Step 1: language.** Pick a programming language: Python, JavaScript, TypeScript, Java, C++, C#, Go, or "Language-agnostic pseudo-code". Save it to `user.preferredLanguage`. The AI uses this language's vocabulary and idioms in explanations and hints, and assumes it when interpreting the pseudo-code. It never outputs a solution in it.

**Step 2: AI provider.** The form (React Hook Form + Zod) has these fields:

- Provider dropdown: every provider in `src/lib/providers.ts`.
- API key input (password type).
- Model dropdown, enabled only after the key is entered.

The flow works as follows:

- The server fetches the provider's list-models endpoint with the user's key via `/api/settings/models`. This also validates the key. Keep a small curated fallback list in case the endpoint fails. Don't hardcode model IDs anywhere else, because they go stale.
- A "Test connection" button makes a tiny `generateText` call before saving.
- An optional "Vision model for notebook images" section lets the user pick a provider and model. It defaults to "same as above" when the chosen model supports images; otherwise it lets them add a separate key.
- The user can edit all of this later in `/settings`.

### 7. Encryption of secrets

`lib/crypto.ts` uses Node `crypto` with AES-256-GCM. It generates a random 12-byte IV for each encryption and stores `{ ciphertext, iv, authTag, keyVersion }`, all base64, so the encryption key can be rotated later.

API keys are decrypted only inside server code, at the moment an AI call is made. They are never returned to the client, never logged, and never included in error messages. The UI shows only `sk-…abcd` (the last 4 characters, stored in plaintext as `keyLast4`).

### 8. Data models (Mongoose)

ts

```ts
User {
  email (unique, lowercase), passwordHash,
  preferredLanguage, onboardingStep: 'language'|'provider'|'done',
  ai: {
    provider: 'openai'|'anthropic'|'openrouter', model,
    apiKey: EncryptedField, keyLast4,
    vision?: { provider, model, apiKey?: EncryptedField, keyLast4? }
  },
  createdAt, updatedAt
}

RefreshToken { userId, tokenHash, family, expiresAt (TTL), revokedAt?, replacedBy? }

Problem {
  userId (indexed), title, statement,
  tags: string[], tagsSource: 'user'|'auto'|'none',
  language,                    // snapshot of preferredLanguage at creation
  latestAttemptId?, attemptCount, lastVerdict?,
  createdAt, updatedAt
}
// text index on { title, statement }; compound index { userId, tags, updatedAt }

Attempt {
  problemId, userId, version (1,2,3…),
  pseudoCode, idea,
  images: [{ r2Key, mimeType, extractedText? }],
  status: 'queued'|'extracting'|'understanding'|'tracing'|'diagnosing'|'done'|'error',
  understanding?: Understanding,       // stage 1 output
  vizSpec?: VizSpec,                   // stage 2 + 3 output
  specVersions: [{ createdAt, reason, vizSpec }],   // follow-up regenerations
  model: { provider, model }, tokenUsage?, error?,
  createdAt
}

Message {
  attemptId, userId, role: 'user'|'assistant',
  content, focusStepIds?: string[], producedSpecVersion?: number, createdAt
}
```

Keep the list of allowed tags in `lib/tags.ts`: Array, String, Hash Map, Two Pointers, Sliding Window, Binary Search, Stack, Queue, Linked List, Tree, BST, Heap, Graph, BFS, DFS, Recursion, Backtracking, Dynamic Programming, Greedy, Sorting, Bit Manipulation, Math, Matrix, Trie, Union Find, and Intervals. Auto-tagging can only choose from this list.

### 9. The visualization spec (the core contract)

Define it in `lib/ai/schemas/vizSpec.ts` with Zod. The AI output is validated against this schema, and the renderer consumes only this schema.

ts

```ts
VizSpec = {
  version: 1,
  summary: {
    understoodApproach: string,      // "You're trying to use two pointers from both ends…"
    verdict: 'works' | 'fails' | 'partially_works' | 'unclear',
    testInputDescription: string,
    expectedOutput: string,
    actualOutput: string,
  },
  codeLines: string[],               // user pseudo-code completed into a runnable whole (header, return…), 1 line per entry
  addedLines?: number[],             // indexes of lines the AI added to complete it; logic is never changed
  structures: Array<{
    id: string, label: string,
    kind: 'array'|'string'|'hashmap'|'set'|'stack'|'queue'|'linkedList'
         |'tree'|'graph'|'matrix'|'variables'
  }>,
  loops: Array<{ id: string, label: string, line: number }>,
  steps: Array<{
    id: string,
    line: number | null,             // index into codeLines → highlight
    iteration?: { loopId: string, index: number },
    title: string,                   // short, e.g. "Compare nums[left] + nums[right]"
    explanation: string,             // 1–3 sentences
    states: Record<structureId, StructureState>,  // full snapshot per step
    pointers?: Array<{ structureId, name: string, index: number|string }>,
    highlights?: Array<{ structureId, targets: (number|string)[],
                         tone: 'active'|'compare'|'success'|'error'|'visited' }>,
    event?: 'init'|'compare'|'swap'|'insert'|'remove'|'push'|'pop'|'visit'
            |'recurse'|'return'|'update'|'output',
    isBugMoment?: boolean,           // where the logic diverges from correct behavior
  }>,
  diagnosis: {
    whatGoesWrong: string,
    whyItGoesWrong: string,
    bugStepIds: string[],
    failingInputs?: string[],
    thinkingHints: string[],         // progressive: vague → more specific, NEVER the solution
    rethink?: {                      // absent when the approach works (and on older specs)
      scope: 'fix-the-details'|'rethink-the-approach',
      brokenAssumption: string,      // the belief the approach relies on that the problem breaks
      shiftInThinking: string,       // a new angle as a question; never names the technique
    },
  },
  autoTags?: string[],
}
```

`StructureState` is a discriminated union on `kind`:

- array or string: `{ values: (string|number|null)[] }`
- hashmap: `{ entries: [key, value][] }`
- set: `{ values }`
- stack or queue: `{ items }`
- linkedList: `{ nodes: { id, value, next } [] }`
- tree: `{ nodes: { id, value, left?, right?, children? }[], rootId }`
- graph: `{ nodes: { id, label }[], edges: { from, to, weight? }[], directed }`
- matrix: `{ rows: (string|number|null)[][] }`
- variables: `{ vars: Record<string, string|number|boolean|null> }`

Give array items stable IDs (e.g. a hidden `ids` array) so motion's layout animations can show swaps and moves instead of re-rendering.

Constraints enforced in the prompt and validated in code:

- Use a small test input (roughly ≤ 8 array elements, ≤ 7 tree nodes).
- Cap steps at about 80. If there are more, collapse uninteresting iterations into a single step with "…iterations 3–6 omitted, same pattern".
- Every step's `states` must contain every structure.

### 10. AI pipeline

`lib/ai/providers.ts` exports `getModel(user, purpose: 'reasoning'|'vision')`. It decrypts the key and returns `createOpenAI({ apiKey })(model)`, `createAnthropic({ apiKey })(model)`, or `createOpenRouter({ apiKey })(model)`.

`POST /api/problems/[id]/attempts` creates an Attempt and runs the pipeline. It streams progress events to the client (SSE or the AI SDK's data stream) and updates `attempt.status` after each stage, so a page refresh can resume showing progress.

**Stage 0: image to text (optional, before processing).** `/api/uploads/extract` sends the R2 image to the vision model. The prompt asks it to transcribe the handwritten pseudo-code and notes faithfully, preserving the user's mistakes and not fixing anything. The result is inserted into the textarea so the user can review and edit it. Never auto-submit the transcription.

**Stage 1: understand.** A structured output call that returns:

- `restatedProblem`, `userApproachInOwnWords`, `keyInvariantsUserAssumes`.
- `chosenTestInput`, chosen to expose the bug if one is suspected, plus `expectedOutput`.
- `suggestedTags`, used only if the problem has no tags yet. Save them with `tagsSource: 'auto'`.

**Stage 2: trace.** This is the accuracy-critical stage, because LLMs are unreliable at simulating execution in their heads. Use execution as the primary path and fall back to LLM simulation:

1. The LLM translates the user's pseudo-code faithfully into an instrumented JavaScript function. It must preserve the user's logic, including the bugs. The function calls `trace({ line, iteration, event, states, pointers, highlights })` at each meaningful point.
2. Run it in `quickjs-emscripten` with a memory limit, a ~2s time limit, and a 500-trace-event limit. It has no network or filesystem access. Infinite loops get caught by the limits, and hitting a limit is itself a diagnosis ("your loop never terminates because…").
3. The raw trace events become `steps`. A second LLM call then writes `title` and `explanation` for each step and marks `isBugMoment`.
4. If translation or execution fails twice, fall back to having the LLM produce the whole spec directly via structured output.

**Stage 3: diagnose.** Given the problem, the user's approach, the trace, and the expected versus actual output, fill in `summary.verdict` and `diagnosis`.

**Validation and retry.** Every structured output is parsed with Zod. On failure, retry up to 2 times with the validation error appended to the prompt. Store `tokenUsage`.

**No-solution guardrail.**

- The system prompt for every call includes this: *"You are a tutor. Never provide a correct solution, corrected code, or the corrected algorithm. You may describe where and why the user's reasoning fails, show counterexamples, and give hints about how to think (properties to notice, questions to ask). Hints must be progressive and must not be directly implementable as the answer."*
- After diagnosis and after every follow-up, run a lightweight check call that answers "Does this text reveal a working solution? yes/no + offending sentence". If yes, regenerate once with stricter instructions.
- The hints UI reveals one hint at a time.

### 11. Follow-up questions

The workspace has a chat panel under the visualization. The user can select one or more steps (in the timeline) and ask something like "why does left move here?"

`POST /api/attempts/[id]/messages` sends the problem, the user's code and idea, `summary`, `diagnosis`, the focused steps, and the last ~10 messages. It streams a text answer with `streamText`.

The model has one tool, `regenerateVisualization({ reason, focusStepIds?, newTestInput? })`. When it calls this tool, run stages 2–3 again with that guidance, push the result to `specVersions`, and point the player at the new version. Store the message with `producedSpecVersion`. The answer goes through the same no-solution guardrail.

### 11a. Solutions (opt-in)

The tutor never volunteers a solution, but a learner can ask for one from the workspace's Solution button. Before the first one exists it asks whether they'd rather try once more. Solutions are versioned per problem and stored, so opening them again costs nothing:

- **v1** builds on the learner's newest analysed attempt: keep their approach and fix only what's broken, or, if the strategy can't work, the closest correct approach, with a note on what carried over and what changed.
- **Later versions** answer a request: a different approach, a better time or space complexity, or something specific. The learner asks from the page or the chat proposes one.
- `/problems/[id]/solution`: the left pane has the statement, the version picker, the approach (complexity, key ideas, why it works, relation to the attempt) and the code; the right pane has the walkthrough (the Player, with "skip iteration / skip loop" and every step grouped by loop iteration), a line-by-line breakdown, and a chat about the solution.
- The code is run in the sandbox like an attempt; if its result disagrees with the expected one it's re-solved once, and a remaining mismatch is shown to the learner.

### 12. File storage (Cloudflare R2)

The client requests `POST /api/uploads/presign` with `{ problemId, mimeType, size }`. The server validates the type (png, jpg, or webp) and size (≤ 8 MB), then returns a presigned PUT URL. Object keys follow `users/{userId}/problems/{problemId}/{uuid}.{ext}`.

Images are displayed through short-lived presigned GET URLs, and the bucket stays private. Visualization specs live in MongoDB. If a spec ever exceeds about 1 MB, store it in R2 under `.../specs/{attemptId}-v{n}.json` and save the key instead.

### 13. Pages and UI

- `/problems`
  - Tabs: "All" plus one tab per tag the user actually has (from a distinct-tags query).
  - A search input (debounced, using the Mongo text index), shadcn cards or a table with title, tags, attempt count, last verdict badge, and updated date.
  - Server-side pagination (page size 12), with page, tag, and search stored in URL search params.
  - An "Add new" button.
- `/problems/new`
  - A statement textarea with a required title, which is auto-suggested from the first line.
  - An optional multi-select of tags.
  - "Continue" creates the Problem and goes to the workspace.
- `/problems/[id]` **workspace**, a resizable two-pane layout (shadcn `Resizable`):
  - Left pane:
    - The problem statement, collapsible.
    - The pseudo-code editor with line numbers.
    - An "Idea / explanation" textarea.
    - An image upload dropzone with a "Extract text" button.
    - A "Process" button.
    - An attempts dropdown (v1, v2, …). Selecting an attempt loads its code and spec read-only. "New attempt" pre-fills from the latest attempt.
  - Right pane:
    - A progress stepper while processing.
    - Then the **Player**: play/pause, previous/next, speed (0.5x–2x), a timeline scrubber with iteration markers and red bug markers, and keyboard shortcuts (←/→/space).
    - The **CodePane** highlights the current line.
    - Structure renderers animate the state changes.
    - The **ExplanationPanel** shows the step title, explanation, and an "Iteration 3 of loop `i`" badge.
    - A "Diagnosis" tab shows the verdict, what and why, and links that jump to bug steps.
    - A "Hints" tab shows whether to fix details or rethink the strategy, the broken assumption, a different way to look at the problem, and progressive hints revealed one at a time.
    - A chat panel for follow-ups.
- `/settings`: language, provider, model, key rotation (re-entering a key replaces it), vision model, and logout.
- Every form uses React Hook Form with a Zod resolver, sharing schemas with the server from `lib/schemas`. Use toasts for errors, skeletons for loading, and support dark mode.

### 14. Security and limits

- Validate every route input with Zod.
- Rate-limit `/attempts` and `/messages` per user (an in-memory limiter for now, behind an interface so it can be swapped for Redis).
- Pseudo-code and idea text max 10k characters each. Statement max 10k characters.
- Never log request bodies on AI routes.
- Map provider errors to friendly messages: invalid key, quota exceeded, model not found.
- Code generated by the LLM runs only inside QuickJS, never via `eval`, `Function`, or `node:vm`.

### 15. Build phases (implement in order, verify each before moving on)

1. **Scaffold.** Set up Next.js, TypeScript, Tailwind, shadcn, env validation, the Mongo connection singleton, and the base layout.
2. **Auth.**
   - Build the models, JWT helpers, cookies, the signup/login/logout/refresh/me routes, rotation with reuse detection, middleware, and the client fetch wrapper.
   - *Acceptance:* the session survives access token expiry, and logout revokes the refresh family.
3. **Onboarding and settings.**
   - Build encryption, the provider factory, model listing, and the test-connection call.
   - *Acceptance:* the stored key is encrypted in Mongo and never appears in any API response.
4. **Problems CRUD and list.** Build tag tabs, search, and pagination.
5. **VizSpec schema and renderers.** Build all renderers and the Player using **hand-written fixture specs**: two-pointer on an array, BFS on a graph, recursion on a tree, and sliding window with a hashmap. Do this before any AI work. *Acceptance:* the fixtures animate smoothly.
6. **AI pipeline.** Build stages 1–3, starting with the LLM-simulated fallback, then the QuickJS execution path. Add streaming progress, auto-tagging, and the guardrail.
7. **R2 uploads and image extraction.**
8. **Follow-up chat** with regeneration and spec versions.
9. **Polish.** Add error states, empty states, mobile layout (stack the panes vertically), and cost/token display per attempt.

### 16. Out of scope for now (design so these are easy to add later)

Redis rate limiting, background job queue, sharing a visualization by public link, and exporting a visualization as a GIF or video.