## What and why

<!-- What does this change, and what problem does it solve? Link the issue: "Closes #123". -->

## How I tested it

<!-- Steps you ran, or screenshots/recordings for UI changes. -->

## Checklist

- [ ] `yarn lint` and `npx tsc --noEmit` pass
- [ ] Every query I added is filtered by the session's `userId`
- [ ] Any new text the learner sees goes through `revealsSolution()` (unless it is part of the solutions feature)
- [ ] I updated the README, `.env.example` or `CLAUDE.md` if setup or architecture changed
