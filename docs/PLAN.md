# mmani-shopping-cart — Phased Implementation Plan (Golden Framework, run 1 of 3)

**Target:** rebuild the DeskDrop storefront from `coderabbit-demo/qa-agent-demo` (read-only reference) into this repo, one PR per step, using the Golden Framework v1.0.
**Mode:** Greenfield. Each feature becomes golden-pinned once accepted; later steps run as brownfield features.
**Stack (same as reference):** Next.js 16, React 19, TypeScript 7, `node --test` unit tests, Playwright e2e, localStorage only. No backend, no new dependencies beyond the reference `package.json`.

## Roles (this run)

| Actor | Who |
| --- | --- |
| Maintainer | Mahesh. Approves this plan, each brief, any golden change, any skipped Critical/Major |
| Orchestrator | Claude Code. Writes briefs, validates findings, runs gates. Writes no product code |
| Author | CodeRabbit Coding Agent: `coderabbit code new` / `resume` / `push`. One task per step, one fix task per review round |
| Judges | 4 read-only subagents (Opus, a different model from the author): scope, behavior/goldens, tests, security/hygiene |
| Gate | CodeRabbit review + PR Security Review + Security Gate check + CI on the exact head commit |

## Simplifications for run 1

Keep the comparison against SDD and Kiro fair and the overhead low:

- The scope gate, red-then-green and strict gate are **small shell scripts** in `scripts/golden/`, not a service.
- The four judges run as parallel subagents from the orchestrator, not in CI.
- QA Agent (`@coderabbitai test`) is requested on every feature PR and swept after merge; it never blocks the merge.
- Deep Scan runs twice: once after PR 2 (first real attack surface, the sign-in and checkout forms) and once before "release" (after PR 6).
- Stage timing goes in one CSV (`docs/stage-log.csv`) so the three runs can be compared.

## Build to the spec, not the reference code

The reference is used for product scope, UX and copy only. Its code is not copied, and briefs never point the agent at its `lib/` or `components/`. Cart rules the acceptance tests must hold:

1. A cart line keeps the color the shopper chose; the same product in two colors is two lines.
2. Changing quantity (clamped to 1–10) recomputes the line total and the subtotal.
3. The DESK15 discount (15% at a $100+ subtotal) is recomputed whenever the cart changes, and removed with a message when the subtotal drops below $100.
4. Standard delivery is free; express adds $12, shown in the cart, checkout and receipt totals.
5. Signing in keeps the wishlist.
6. Order history stores every item of each order.

## Visual design: CodeRabbit brand

The reference supplies scope, UX flows and copy only. Its beige look does not carry over; the UI follows [coderabbit.ai/brand](https://www.coderabbit.ai/brand). `docs/BRAND.md` (PR 0) holds these rules, and CodeRabbit review reads it as a code guideline:

- **Color:** lead with **CR Orange `#FF570A`** (primary CTAs, focus, active states) on **mauve neutrals** (surfaces, text, borders). **CR Mint `#25E2A8`** and **CR Cobalt `#687FF5`** are supporting accents only, for success/in-stock states and info/links. Cream is not used; it is for content marketing.
- **Theme:** dark-first, like coderabbit.ai, with a light theme via `prefers-color-scheme`. Every color is a CSS custom property in `globals.css`; components use tokens, never raw hex. Text and CTAs meet WCAG AA contrast in both themes.
- **Type:** **Geist** for brand text: Semi-bold 600 headings; Regular 400 for body, navigation and CTAs. **Hack** for utility text: Bold 700 for labels and metrics (badges, counts, totals labels); Regular 400 for prices, SKUs, order IDs and the coupon code. Geist loads with `next/font/google`; Hack is self-hosted from `public/fonts/` with its license file. No new npm dependency.
- **Logo:** the store keeps its own name, DeskDrop, set in Geist. We never redraw the rabbit or pair the mark with substitute text. The footer carries a small "Built with CodeRabbit" credit using the official logotype file, unmodified, with clear space: white on the dark theme, orange on the light theme. The files are committed to `public/brand/` from coderabbit.ai/brand. The header never shows a CodeRabbit mark.
- **Product art:** the built-in SVGs are recolored with brand tokens: mauve backgrounds, orange and accent details.

## Phases (one PR each, < 30 files excluding goldens)

### PR 0 — `chore: scaffold + framework contract` (approved greenfield exception)
- Next.js/TS skeleton, `package.json` and lockfile pinned to the reference versions, `tsconfig`, `.gitignore`, empty layout page.
- `.github/workflows/ci.yml`: typecheck, unit tests, golden check (no-op until PR 2), e2e (from PR 3). No path filters.
- `.coderabbit.yaml`: `request_changes_workflow: true`, golden path instruction, gitleaks + semgrep, **Security Gate** custom check (`mode: error`), `AGENTS.md` as code guidelines.
- `AGENTS.md`: the framework's author rules (stack, no new deps, test per behavior, no TODO/debug artifacts).
- `docs/BRAND.md` (rules above). `.coderabbit.yaml` lists it as a code guideline for `app/**` and `components/**`, plus a path instruction that flags a raw hex color outside the token block in `globals.css`.
- `scripts/golden/`: `scope-gate.sh` (deny list + `ALLOW:` globs), `red-green.sh`, `strict-gate.sh`, `judges/` (one brief per judge).
- Maintainer action: turn on the CodeRabbit Security check with Block on = Major+; add a branch ruleset that requires CI and CodeRabbit Security.

### PR 1 — `feat: catalog + cart domain`
- `lib/catalog.ts` (8 products, categories, `money`), `lib/store.ts` (pure state functions: add/change/remove, coupon, totals with shipping, sign-in, place order).
- `tests/store.test.mjs`: acceptance tests from the spec, including cart rules 1–6. Red is meaningful because the tests assert behavior, not imports.
- No UI.

### PR 2 — `feat: behavior pin for domain` *(pin the accepted feature)*
- `scripts/golden/capture.mjs`: replays fixture scenarios (carts, coupons, deliveries, orders) through `lib/store` and writes JSON goldens to `tests/golden/`; `--check` compares byte-for-byte.
- `tests/golden/BASELINE` (source commit) + `MANIFEST.sha256`.
- CI golden job goes live. From here on, every PR is brownfield.
- **Deep Scan baseline** after merge.

### PR 3 — `feat: storefront shell + browse`
- `app/layout.tsx` (Geist + Hack fonts), `globals.css` (brand tokens, dark + light), `components/shell.tsx` (header, mobile nav, bag/wishlist counts, footer with the "Built with CodeRabbit" credit), `product-art.tsx`, `product-card.tsx`, `shop.tsx`.
- `/` with search, category filter, in-stock filter, sort, quick-add; `not-found.tsx`.
- Playwright config + journey: search, filter, 404, mobile viewport fit.
- Goldens extended: server-rendered HTML snapshots of `/` and 404.
- e2e: a contrast check on the key text and CTA tokens in both color schemes.

### PR 4 — `feat: product detail + cart page`
- `/products/[slug]` (color + quantity selection, add to bag), `/cart` (quantity, remove, apply/remove coupon), `store-provider.tsx` (in-memory state).
- e2e: choose a non-default color → cart shows that color (rule 1); change quantity → line total updates (rule 2); drop below $100 → coupon is removed (rule 3).

### PR 5 — `feat: checkout, receipt, orders`
- `/checkout` (address form with validation, standard/express delivery, simulated payment), `/checkout/success`, `/orders`.
- e2e: express adds shipping to the total (rule 4); a multi-item order appears in full in history (rule 6); validation blocks an empty form.
- **Security focus:** form input is rendered safely, no PII in URLs or logs. Attack-path tests use benign markers.

### PR 6 — `feat: account, wishlist, persistence, demo reset`
- `/account` (demo sign-in/out, invalid credentials error), `/wishlist`, `/demo` reset, localStorage persistence under `deskdrop-demo-v1` with in-memory fallback.
- e2e: signing in keeps the wishlist (rule 5); a reload keeps the cart and receipt; reset clears everything; storage disabled → app still works.
- **Security focus:** demo credentials are clearly fixture-only, no real auth claims, and localStorage parsing tolerates corrupt data.
- **Pre-release Deep Scan + Attack Surface** after merge; QA sweep across all PRs.

### Optional PR 7 — `chore: walkthrough recorder + README`
- `scripts/record-demo.mjs`, README matching the reference.

## Per-step loop (what the orchestrator runs)

1. Write the brief in `docs/briefs/NN-*.md`: scope, `ALLOW:` globs, acceptance tests, required checks, what to report.
2. `coderabbit code new "<brief>"`. Large steps ask for a plan first: `coderabbit code plan`, then approve.
3. `coderabbit code push` to a step branch → `scope-gate.sh` → deterministic fixers (format, safe lint) as a labeled commit.
4. Verify in parallel: CI on the branch, plus 4 judges. Red-then-green for every new test (against `main`, or the previous head in a fix round).
5. Open the PR with validation results and any skipped findings; comment `@coderabbitai test`.
6. Fix rounds: validate the findings, put all valid ones in **one** Coding Agent fix task with one regression guard each, then push once.
7. `strict-gate.sh`: CR approved, 0 unresolved threads, no Crit/Major in the latest review, CI + CodeRabbit Security + Security Gate green. Then merge.
8. Log the stage times; QA sweep.

## Done when

- All 6 PRs merged through the strict gate, with no hand-written product code by the orchestrator.
- Cart rules 1–6 each have an acceptance test, and the goldens pin them.
- Goldens cover domain outputs and key pages; CI is green on `main`.
- Deep Scan baseline and pre-release scan are triaged.
- `docs/stage-log.csv` is filled in for comparison with the SDD and Kiro runs.
