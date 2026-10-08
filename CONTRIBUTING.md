# Contributing to Scratchpad

Thanks for helping out! Bug reports, ideas, docs fixes and code are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and suggesting features

- Search the [existing issues](https://github.com/na1mur/scratchpad/issues) first.
- Open a new issue with the bug or feature template. For bugs, include steps to reproduce, and never paste API keys or
  secrets.
- **Security problems:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setting up

You need Node 22+, Yarn 1.22 (classic) and a MongoDB instance. Follow
[Running locally](README.md#running-locally) in the README. Use `yarn` only: `yarn.lock` is the source of truth.

[`PLAN.md`](PLAN.md) is the product spec and [`CLAUDE.md`](CLAUDE.md) describes the architecture and conventions
(auth, the AI pipeline, the sandbox, the solution guardrail). Read the relevant parts before larger changes.

## Sending a pull request

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep it focused: one concern per pull request. For anything big, open an issue first so we can agree
   on the approach before you spend time on it.
3. Check your work:
   ```bash
   yarn lint
   npx tsc --noEmit
   ```
   `yarn build` also runs the type check. There is no test runner yet, so describe how you tried the change by hand.
4. Open the pull request against `main` and fill in the template. CI runs lint and the type check.

### Things to keep in mind

- Match the surrounding code's style, naming and comment density.
- Every database query is filtered by the session's `userId`.
- Model-generated code runs only in the QuickJS sandbox, never through `eval`, `Function` or `node:vm`.
- Text the model writes for learners goes through `revealsSolution()`. The solutions feature is the one exception.
- Don't commit secrets or `.env` files. Add new settings to `.env.example` and the README table.

## License

Scratchpad is licensed under the [Apache License 2.0](LICENSE). Unless you say otherwise, any contribution you
intentionally submit is licensed under the same terms (section 5 of the license), with no additional conditions.
