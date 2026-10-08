# Security policy

Scratchpad stores users' (encrypted) AI provider keys and runs model-generated code in a sandbox, so we take security
reports seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
[Report a vulnerability](https://github.com/na1mur/scratchpad/security/advisories/new). If that isn't possible, email
[naeemhasan28@gmail.com](mailto:naeemhasan28@gmail.com).

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within a few days
and will keep you updated until it's fixed. Please give us reasonable time to fix the problem before disclosing it.

Of particular interest: sandbox escapes (`src/lib/ai/pipeline/sandbox.ts`), auth and session handling, access to another
user's data, leaks of stored API keys, and server-side request forgery through the problem-link fetcher.

## Supported versions

Only the latest commit on `main` is supported.
