# Scratchpad

Scratchpad is a tutor for data-structure and algorithm problems. Write your approach as pseudo-code or real code
(Python, JavaScript or TypeScript), upload a photo of your notebook, or draw it on the Sketch canvas. Scratchpad works
out what you're trying to do, runs it step by step on test cases, animates every step and loop iteration, and shows
where your reasoning breaks. You get progressively more specific hints first. A worked solution is opt-in: you ask for
one, and it is built from your own attempt.

- **Test cases.** Each problem gets a fixed set of test cases whose answers are computed by running a reference
  solution, so the expected output isn't just the model's guess.
- **Playground.** Run your code against those cases in the browser (no server, no tokens) and step through it.
- **Sketch.** A canvas of arrays, stacks, queues, linked lists, trees, graphs, pointers and notes for working a problem
  out visually. A drawing can be turned into a draft attempt.
- **Activity calendar.** Your profile shows a year of practice and your streaks.
- **Sharing.** Make one attempt or one solution public by link; others can fork the problem into their own account.
  Unsharing kills the link.
- **Problem links.** Paste a LeetCode link (or one from Codeforces, AtCoder, GeeksforGeeks, CodeChef, Naukri Code360,
  HackerRank, or most other pages) and the statement is read for you.

You bring your own API key (OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, Together AI, Fireworks,
DeepInfra, Cohere, Perplexity, Baseten, Vercel AI Gateway, OpenRouter, Moonshot (Kimi), Z.AI (GLM), Alibaba Qwen,
MiniMax, NVIDIA NIM, SambaNova, Nebius or Hugging Face; the list lives in `src/lib/providers.ts`). OpenRouter users can
also sign in with OpenRouter instead of pasting a key. Keys are encrypted at rest and only decrypted on the server at
the moment of an AI call. Web search for known reference solutions is optional and uses your own Tavily key.

## Running locally

Requirements: Node 22+, Yarn 1.22, and a MongoDB instance.

```bash
yarn install
cp .env.example .env.local   # then fill it in, see below
yarn dev                     # http://localhost:3000
```

A quick local MongoDB: `docker run -d -p 27017:27017 --name dsa-mongo mongo:8`.

Without signing up you can see the visualizer at `/demo`, which plays five hand-written buggy examples.

### Environment

Every variable is documented in [`.env.example`](.env.example): what it's for, whether it's required, and how to
generate a value. Copy it to `.env.local` and fill it in. Only the database, the JWT and encryption secrets, and
`APP_URL` are needed to run locally; email, Cloudinary, Google login, the per-hour usage limits and the token lifetimes
are optional extras. The server validates everything at startup and refuses to start if a required value is missing.
Tavily and OpenRouter need no server configuration: those keys belong to each learner.

### Cloudinary (optional)

Uploads (notebook photos, profile photos, sketch pictures, visualizations) go to
[Cloudinary](https://cloudinary.com) through the server, so there's no CORS rule to set. Create a free account and set
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Files are stored with the `authenticated`
delivery type, so they're only reachable through signed links the app generates. Without these three values uploads
are disabled (the upload routes answer 503) and the rest of the app works.

## Deploying

[Vercel](https://vercel.com) is the recommended place to deploy Scratchpad: it's made by the Next.js team and needs no
configuration. The button clones the repo into your own GitHub account and asks for the required environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fna1mur%2Fscratchpad&project-name=scratchpad&repository-name=scratchpad&env=MONGODB_URI,JWT_ACCESS_SECRET,JWT_REFRESH_SECRET,ENCRYPTION_KEY,APP_URL,SMTP_USER,SMTP_PASS&envDescription=Database%2C%20secrets%20and%20SMTP%20login%20for%20Scratchpad.%20See%20.env.example%20for%20how%20to%20generate%20each.&envLink=https%3A%2F%2Fgithub.com%2Fna1mur%2Fscratchpad%2Fblob%2Fmain%2F.env.example)

Before or right after you click it:

1. **Database.** Use a hosted MongoDB such as a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, and paste its
   connection string as `MONGODB_URI`. Allow Vercel to reach it in Atlas' network access list.
2. **Secrets.** Generate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `ENCRYPTION_KEY` as described in
   [`.env.example`](.env.example).
3. **`APP_URL`.** Set it to the public address of the deployment (your custom domain, or the `*.vercel.app` address
   once you know it) and redeploy if you change it. Requests from any other origin are rejected.
4. **Email.** Sign-up and password reset send codes over SMTP, so set `SMTP_USER` and `SMTP_PASS` (and `EMAIL_FROM`).
   In production, sending fails without them.
5. **Optional.** Cloudinary (uploads) and Google login can be added later in the project's
   environment variable settings. For Google login, add `<APP_URL>/api/auth/google/callback` as an authorized redirect
   URI.

You don't have to use Vercel. Scratchpad is a standard Next.js app, so it runs anywhere that can run Node 22+: build it
with `yarn build` and start it with `yarn start`, on a platform of your choice or on your own server. It needs the same
environment variables, and the in-memory rate limits assume a single instance.

## Scripts

- `yarn dev`: dev server (Turbopack)
- `yarn build`: production build, including the TypeScript check
- `yarn lint`: ESLint
- `npx tsc --noEmit`: typecheck only

## How it works

An attempt runs through a pipeline on the server, and its progress streams to the page as it goes:

1. **Understand.** The model restates your approach and the test cases to run. When the problem's harness is ready it
   uses the fixed cases (see below); otherwise it picks 3 to 5 inputs that cover different situations, each with the
   correct expected output.
2. **Translate.** The model rewrites your code or pseudo-code, bugs included, as plain JavaScript that mirrors it line
   for line, plus a small adapter that builds the input. It doesn't write any tracing calls.
3. **Instrument.** The code is parsed with [acorn](https://github.com/acornjs/acorn) and tracing calls are inserted
   automatically (`src/lib/trace/`), so every assignment, condition, return and loop iteration is recorded with a
   snapshot of the variables in scope.
4. **Run.** The instrumented code runs on every test case in [QuickJS](https://github.com/justjake/quickjs-emscripten)
   inside a throwaway worker thread with a memory limit, a 2 s time limit and a cap on traced steps, with no network,
   filesystem or host access. Hitting a limit is itself a finding ("your loop never terminates"). The snapshots become
   the structures, pointers and highlights of each step. If the program can't be translated or run, the model
   simulates the run instead.
5. **Narrate.** The model writes a title and an explanation for each step, one case at a time in parallel.
6. **Diagnose.** The model compares what happened with what should have happened and writes the verdict, what goes
   wrong, why, and progressive hints. For cases that ran, pass or fail is decided in code by comparing the actual
   return value with the expected one, not by the model.

Every structured output is validated with Zod and retried with the validation errors. Every diagnosis and chat
answer goes through a separate "does this reveal the solution?" check, and is rewritten if it does. Solutions are the
one deliberate exception: you ask for them, and they have their own pipeline.

**Test case harness.** When a problem is created (or its statement or link changes), a background job builds a hidden
harness (`src/lib/harness/`): the function signature (from LeetCode's metadata when the link is LeetCode, otherwise
from the model), a few fixed test cases, how answers are compared, and a reference solution. The reference runs in the
sandbox and the *computed* answers are what's stored; a case whose stated answer disagrees is rewritten or dropped. The
reference solution never reaches the browser. Problems the harness can't cover (design problems, unsupported types)
fall back to model-picked cases.

**Solutions.** A solution is built from your newest analysed attempt, or from a request such as a different approach or
a better complexity. Its code is run in the sandbox against the cases and re-solved once if the result disagrees, then
narrated like an attempt. Solutions are versioned and stored, so opening one again costs nothing.

**Playground.** For Python, JavaScript and TypeScript problems with a ready harness, your code runs on the fixed cases
in your browser: JS and TS in a Web Worker, Python in a warm [Pyodide](https://pyodide.org) worker. "Show steps" traces
the run into the same player the server pipeline uses. Nothing is sent to the server or saved.

The visualization contract lives in `src/lib/ai/schemas/vizSpec.ts`; the renderers in `src/components/viz/` consume
nothing else. [`CLAUDE.md`](CLAUDE.md) describes the architecture in more detail, and [`PLAN.md`](PLAN.md) is the
original build plan.

## Security notes

- Access token (15 min) and refresh token (7 days) are httpOnly cookies. Refresh tokens are stored only as SHA-256
  hashes and rotate on every use; presenting a revoked one revokes its whole family.
- CSRF: every POST/PUT/PATCH/DELETE must carry an `Origin` matching `APP_URL`, on top of `SameSite=Lax` cookies.
- Every query is scoped by the user id from the verified token.
- API keys are never returned to the client, logged, or included in errors; the UI only shows the last four
  characters.
- Model-generated code only ever runs inside QuickJS, never via `eval`, `Function` or `node:vm`. (The Playground runs
  your own code in your own browser, in a worker.)
- The server fetches pages from problem links the learner types, so that fetcher refuses private, loopback and
  link-local addresses (checked at connect time), allows only ports 80 and 443, follows at most 3 redirects, and caps
  time and size.
- Share links carry a random token and exist only while the share does: unsharing deletes it. Shared pages never show
  chat, fetched source text or reference solutions.
- The admin role is read from the database on every request, not from the token, and non-admins get a 404 on `/admin`.
- Uploads go through the server to Cloudinary as `authenticated` assets and are viewed through signed URLs.
- Rate limits on processing, chat, uploads and login are in-memory (single instance) behind an interface in
  `src/lib/rateLimit.ts`, so they can move to Redis.

## Contributing

Scratchpad is open source and contributions are welcome: bug reports, feature ideas and pull requests. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
