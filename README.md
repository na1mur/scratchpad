# Scratchpad

Paste your pseudo-code and reasoning for a DSA problem (or a photo of your notebook). Scratchpad works out what you're
trying to do, runs your approach on a small input, animates every step and loop iteration, and explains where your
reasoning breaks. It never gives you the solution: only where it goes wrong, why, and progressively more specific
hints.

You bring your own API key (OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, Groq, Cerebras, Together AI, Fireworks, DeepInfra, Cohere, Perplexity, Baseten, Vercel AI Gateway, OpenRouter, Moonshot (Kimi), Z.AI (GLM), Alibaba Qwen, MiniMax, NVIDIA NIM, SambaNova, Nebius or Hugging Face; the list lives in `src/lib/providers.ts`). It is encrypted at rest and only decrypted on the server
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

Every variable is documented in [`.env.example`](.env.example): what it's for, whether it's required, and how to
generate a value. Copy it to `.env.local` and fill it in. Only the database, the JWT and encryption secrets, and
`APP_URL` are needed to run locally; email, R2, Google login and Tavily are optional extras. The server validates
everything at startup and refuses to start if a required value is missing.

### Cloudflare R2 (optional)

Browsers upload with presigned PUT URLs. For viewing, either enable public access on the bucket and set
`R2_PUBLIC_URL` (objects are then readable by anyone with the link; keys contain random UUIDs, and the `r2.dev` domain
is rate-limited, so use a custom domain in production), or leave it unset and the app hands out short-lived presigned
GET URLs from a private bucket. Either way the bucket needs a CORS rule allowing your app origin to PUT:

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
5. **Optional.** R2 (notebook photos), Google login and `TAVILY_API_KEY` can be added later in the project's
   environment variable settings. For Google login, add `<APP_URL>/api/auth/google/callback` as an authorized redirect
   URI. For R2, add your deployed origin to the bucket's CORS rule.

You don't have to use Vercel. Scratchpad is a standard Next.js app, so it runs anywhere that can run Node 22+: build it
with `yarn build` and start it with `yarn start`, on a platform of your choice or on your own server. It needs the same
environment variables, and the in-memory rate limits assume a single instance.

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

## Contributing

Scratchpad is open source and contributions are welcome: bug reports, feature ideas and pull requests. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
