# Author rules

- Use Next.js 16, React 19, TypeScript 7, Node >=22.6.0, npm, `node --test` unit tests, and Playwright e2e tests. Use localStorage only; there is no backend.
- Add no dependency without an approved `ALLOW:` line authorizing that dependency change. Keep the approved manifest and npm lockfile consistent.
- Add a test for every new behavior and bug fix. Assert observable behavior rather than only importing modules. Preserve existing tests and assertions.
- Treat all six cart rules in `docs/PLAN.md` as requirements: retain selected colors as separate lines; clamp quantities to 1–10 and recompute totals; recompute DESK15 at a $100+ subtotal and explain removal below it; include free standard or $12 express delivery in all totals; preserve the wishlist on sign-in; store every ordered item in history.
- Do not add TODOs, debug prints, reasoning comments, or comments quoting review requests.
- Never edit goldens unless the brief explicitly allows it. Refactors must leave them untouched.
- Follow `docs/BRAND.md` for all visual work. Styling, fonts, and brand assets begin in PR 3.
- Keep each PR under 30 changed files, excluding goldens. Follow the current brief's scope and `ALLOW:` globs.
