# DSA Buddy

Paste your pseudo-code and reasoning for a DSA problem (or a photo of your notebook). DSA Buddy works out what you're
trying to do, runs your approach on a small input, animates every step and loop iteration, and explains where your
reasoning breaks. It never gives you the solution: only where it goes wrong, why, and progressively more specific
hints.

You bring your own API key (OpenAI, Anthropic or OpenRouter). It is encrypted at rest and only decrypted on the server
at the moment of an AI call.

## Running locally

Requirements: Node 22+, Yarn 1.22, and a MongoDB instance.

```bash
yarn install
cp .env.example .env.local   # then fill it in, see below
yarn dev                     # http://localhost:3000
```

A quick local MongoDB: `docker run -d -p 27017:27017 --name dsa-mongo mongo:8`.

Without signing up you can see the visualizer at `/demo`, which plays four hand-written buggy examples.

### Environment

| Variable | Notes |
| --- | --- |
| `MONGODB_URI` | e.g. `mongodb://127.0.0.1:27017/dsa-viz` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two different random strings, 32+ chars: `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. Encrypts users' API keys (AES-256-GCM). |
| `ENCRYPTION_KEY_VERSION` | Stored with each encrypted value so the key can be rotated later. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2, for notebook photos. Optional: leave empty and uploads are disabled. |
| `APP_URL` | The public origin, e.g. `http://localhost:3000`. Mutating requests must come from this origin. |

The server validates all of these at startup and refuses to start if any required one is missing.

### Cloudflare R2 (optional)

The bucket stays private: browsers upload with presigned PUT URLs and view with short-lived presigned GET URLs. The
bucket needs a CORS rule allowing your app origin to PUT:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

## Scripts

- `yarn dev`: dev server (Turbopack)
- `yarn build`: production build, including the TypeScript check
- `yarn lint`: ESLint
- `npx tsc --noEmit`: typecheck only

## How it works

1. **Understand.** The model restates your approach and picks a small test input that's likely to expose a bug,
   along with the correct expected output.
2. **Trace.** The model translates your pseudo-code, bugs included, into an instrumented JavaScript function that calls
   `trace(...)` at each meaningful point. It runs in [QuickJS](https://github.com/justjake/quickjs-emscripten) inside a
   throwaway worker thread with a memory limit, a 2 s time limit and a 500-event cap, with no network, filesystem or
   host access. Hitting a limit is itself a finding ("your loop never terminates"). The trace is turned into
   validated steps and narrated. If translation or execution fails twice, the model simulates the run instead.
3. **Diagnose.** The model compares what happened with what should have happened and writes the verdict, what goes
   wrong, why, and progressive hints.

Every structured output is validated with Zod and retried with the validation errors. Every diagnosis and chat
answer goes through a separate "does this reveal the solution?" check, and is rewritten if it does.

The visualization contract lives in `src/lib/ai/schemas/vizSpec.ts`; the renderers in `src/components/viz/` consume
nothing else.

## Security notes

- Access token (15 min) and refresh token (7 days) are httpOnly cookies. Refresh tokens are stored only as SHA-256
  hashes and rotate on every use; presenting a revoked one revokes its whole family.
- CSRF: every POST/PUT/PATCH/DELETE must carry an `Origin` matching `APP_URL`, on top of `SameSite=Lax` cookies.
- Every query is scoped by the user id from the verified token.
- API keys are never returned to the client, logged, or included in errors; the UI only shows the last four
  characters.
- Model-generated code only ever runs inside QuickJS, never via `eval`, `Function` or `node:vm`.
- Rate limits on processing, chat, uploads and login are in-memory (single instance) behind an interface in
  `src/lib/rateLimit.ts`, so they can move to Redis.
