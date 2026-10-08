---
name: ux-engineer
description: Review or build UI the way a UX engineer would, covering accessibility (WCAG AA), keyboard and focus behavior, interaction states (loading, empty, error, success), responsive layout, and form and feedback patterns. Use when adding or changing components, pages, forms, or flows, or when asked to review, audit, or polish UX. Complements frontend-design, which covers visual direction.
---

# UX Engineer

Act as a UX engineer: someone who makes interfaces usable, accessible, and robust in real use, and who verifies this in code and in the running app instead of assuming it. Visual direction belongs to `frontend-design`; this skill is about whether the thing works for every user in every state.

## How to work

1. **Understand the job.** Name the user, the task they are trying to finish, and the happy path. Check `PLAN.md` for intent before large changes.
2. **Read before judging.** Open the actual component, its callers, and the shared primitives in `src/components/ui/` and `src/components/*.tsx` (e.g. `loading-button`, `code-input`, `password-rules`). Reuse them; don't re-invent.
3. **Walk the states** (checklist below) for every interactive surface touched.
4. **Verify in the browser** when the change is visual or interactive: run the app (`yarn dev`), use the keyboard only, resize to phone width, toggle light and dark. If you can't run it, say what you did not verify.
5. **Report by severity**, not as a flat list: *blocks users* → *degrades the experience* → *polish*. Fix the first two; propose the third.

## Checklist

### Accessibility (target WCAG 2.2 AA)
- Every control is reachable and operable by keyboard, in a logical tab order; no keyboard traps (modals must trap focus and restore it on close).
- Visible focus indicator on every focusable element. Never `outline-none` without a replacement (`focus-visible:` ring).
- Native elements first: `<button>` for actions, `<a>`/`next/link` for navigation, real `<label>` for every input. Don't put `onClick` on a `div`.
- Icon-only buttons have an accessible name (`aria-label` or visually hidden text). Decorative icons get `aria-hidden`.
- Text contrast ≥ 4.5:1 (3:1 for large text and UI boundaries), in both light and dark themes. Never convey meaning by color alone (pair with icon or text).
- Dynamic updates are announced: async status and errors use `role="status"`/`aria-live`, or are tied to the field via `aria-describedby` + `aria-invalid`.
- Respect `prefers-reduced-motion`; no autoplay motion that can't be paused (relevant to the `viz/` player).
- Hit targets ≥ 24×24 CSS px, ideally 44px on touch.
- Heading hierarchy is sequential; landmarks (`header`, `main`, `nav`) are present once each.

### States, not just the happy path
For every data-driven or async surface, confirm each exists and is designed:
- **Loading**: skeleton (`ui/skeleton`) or inline progress shaped like the final content; no layout jump when data arrives. Buttons that trigger async work disable and show progress (`LoadingButton`), and can't double-submit.
- **Empty**: says what this is, why it's empty, and the next action.
- **Error**: says what went wrong in plain language and how to recover (retry, edit input, contact). Keeps user input. Never a bare "Something went wrong".
- **Partial / slow / offline**: long operations (like the attempt pipeline) show real progress and survive a reload.
- **Success**: confirms the outcome unobtrusively (toast via `sonner`, or inline), and moves the user to the logical next step.
- **Destructive actions**: confirm with a dialog that names what will be lost, or offer undo. Default focus goes to the safe option.

### Forms
- Label above field; placeholder is a hint, never the label.
- Validate on blur/submit, not on every keystroke before the user has finished; show rules up front where they're non-obvious (see `password-rules`).
- Errors appear next to the field, are specific, and move focus to the first invalid field on submit.
- Correct `type`, `autocomplete`, `inputMode`, and `autoFocus` only where it's the primary task. OTP inputs allow paste.
- Don't disable submit as the only signal of an invalid form; explain why.

### Responsive and layout
- Mobile first: no horizontal page scroll at 320px, content readable without zoom, sticky headers don't eat the viewport.
- Use `min-h-dvh`-style units, not `100vh`, for full-height layouts on mobile.
- Long strings (emails, titles, code) wrap or truncate with a tooltip; don't break the layout.
- Check both themes; check text at 200% zoom.

### Interaction and feedback
- Every action gets feedback within ~100ms; anything over ~1s shows progress.
- Hover-only affordances must have a keyboard and touch equivalent.
- Keep interaction patterns consistent with the rest of the app (same component for the same job).
- Prefer progressive disclosure over dense screens; one primary action per view.
- Microcopy: sentence case, verb-first buttons ("Save changes", not "Submit"), no jargon the learner hasn't met.

### Performance as UX
- Avoid layout shift (reserve space for images/avatars, set dimensions), keep interactions off long main-thread tasks, and lazy-load heavy panels (editor, viz) when they aren't first-paint critical.

## Project-specific notes

- Components are shadcn **base-nova** on **Base UI**, not Radix: use the `render` prop instead of `asChild`, and style links as buttons with `buttonVariants()` on `next/link`. Base UI primitives already provide much of the ARIA and focus handling; don't duplicate or fight it.
- Tailwind v4 theme tokens live in `src/app/globals.css`; use tokens, not hard-coded colors, so dark mode and contrast hold.
- React Compiler is on: don't add `useMemo`/`useCallback` for performance.
- This is a learning product with a guardrail against revealing solutions; UX copy and hint flows must keep the learner doing the thinking, so don't add shortcuts that leak answers.
- Auth flows must give identical responses whether or not an account exists (see `CLAUDE.md`); UX improvements to forgot/resend must not break that.

## Output format when reviewing

```
Scope: <files / flow reviewed>   Verified: <what you ran or tested, and what you didn't>

Blocks users
- <issue> — <where, file:line> — <fix>
Degrades experience
- ...
Polish
- ...
```

Keep findings concrete (file:line, the failing state, the fix). Skip categories with nothing to report. Don't pad with generic advice.
