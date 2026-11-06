# mmani-shopping-cart — Phased Implementation Plan (Golden Framework, run 1 of 3)

**Target:** rebuild the DeskDrop storefront from `coderabbit-demo/qa-agent-demo` (read-only reference) into this repo, one PR per step, using the Golden Framework v1.0.
**Mode:** Greenfield. Each feature becomes golden-pinned once accepted; later steps run as brownfield features.
**Stack (same as reference):** Next.js 16, React 19, TypeScript 7, `node --test` unit tests, Playwright e2e, localStorage only. No backend, no new dependencies beyond the reference `package.json`.

## Roles (this run)

| Actor | Who |
| --- | --- |
| Maintainer | Mahesh. Approves this plan, each brief, any golden change, any skipped Critical/Major, and each merge. PRs open automatically |
| Orchestrator | Claude Code. Writes briefs, validates findings, runs gates. Writes no product code |
| Author | CodeRabbit Coding Agent through native repository authoring; no CLI execution or login prerequisite |
| Review | CodeRabbit feedback only. The four historical additional model judges are waived |
| Gate | CodeRabbit review + PR Security Review + the `CodeRabbit Security` check + the Security Gate pre-merge row + CI, on the exact head commit |

## Simplifications for run 1

Keep the comparison against SDD and Kiro fair and the overhead low:

- The scope gate, red-then-green and strict gate are **small shell scripts** in `scripts/golden/`, not a service.
- The historical four additional model judges are waived; use CodeRabbit feedback only.
- QA Agent (`@coderabbitai test`) verifies the exact feature revision. Assess actual executed results; generated, stale or environment-blocked results are not passes. Validate Mac-specific runtime behavior separately on the Mac.
- Deep Scan runs twice: once after PR 2 (first real attack surface, the sign-in and checkout forms) and once before "release" (after PR 6).
- Stage timing goes in one CSV (`docs/stage-log.csv`) so the three runs can be compared.

## CodeRabbit setup: what needs turning on

Once CodeRabbit review is installed on the repo, **PR Security Review runs automatically with every review**. The repo itself needs no setup, and nothing in the repo turns it on. Only two things in the CodeRabbit app need turning on:

| Setting | Where | Why it matters to the gate |
| --- | --- | --- |
| **Publish the CodeRabbit Security GitHub check**: Block on = Major and above | CodeRabbit app → Security → Repositories → Settings | Without it, security findings appear only in the review and the `CodeRabbit` check. With it, a separate `CodeRabbit Security` check-run appears on every head commit. It clears only when a later review confirms the fix in code. `strict-gate.sh` requires it. **Enabled 2026-10-28.** |
| **Deep Scan** | CodeRabbit app → Security | Scans the whole repository at milestones (after PR 2 and before release). Billed per run; not part of the per-PR gate. |

Everything else is configured in `.coderabbit.yaml` and needs no switch:
- the review itself;
- PR Security Review;
- path instructions;
- gitleaks and semgrep;
- the **Security Gate**, a custom pre-merge check. It is reported as a row in the "Pre-merge checks" table of CodeRabbit's summary comment, not as a GitHub check.

The QA Agent is set up separately in the CodeRabbit app (a scope and an environment). Its environment is prepared from `main` once PR 0 merges.

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
- **Logo:** the store keeps its own name, DeskDrop, set in Geist. We never redraw the rabbit or pair the mark with substitute text. The footer carries a small "Built with CodeRabbit" credit using the official logotype file, unmodified, with clear space: the white logotype on the dark theme, and the light-background logotype (a dark wordmark with the orange mark) on the light theme. The files are committed to `public/brand/` from coderabbit.ai/brand. The header never shows a CodeRabbit mark.
- **Product art:** the built-in SVGs are recolored with brand tokens: mauve backgrounds, orange and accent details.

## Jira (issue validation)

The table below records the original product build’s Jira requirements and feature-PR mappings. Those original feature PRs use their issue keys for linked-issue validation. Native incident Debug fix PRs are expressly exempt: they must not read, require, write or include Jira metadata. Use the independent native PR-opening path below. The Jira button independently creates or reuses and reads back its episode Bug; its requirements remain unchanged.

| Issue | Type | PR |
| --- | --- | --- |
| [SC-1](https://coderabbit-demo.atlassian.net/browse/SC-1) | Epic | Requirements: stack, pages, cart rules 1–6, brand, delivery |
| [SC-2](https://coderabbit-demo.atlassian.net/browse/SC-2) | Task | PR 0: scaffold + framework contract |
| [SC-3](https://coderabbit-demo.atlassian.net/browse/SC-3) | Task | PR 0b: automatic PR opening |
| [SC-4](https://coderabbit-demo.atlassian.net/browse/SC-4) | Story | PR 1: catalog + cart domain |
| [SC-5](https://coderabbit-demo.atlassian.net/browse/SC-5) | Task | PR 2: behavior pin |
| [SC-6](https://coderabbit-demo.atlassian.net/browse/SC-6) | Story | PR 3: storefront shell + browse |
| [SC-7](https://coderabbit-demo.atlassian.net/browse/SC-7) | Story | PR 4: product detail + cart page |
| [SC-8](https://coderabbit-demo.atlassian.net/browse/SC-8) | Story | PR 5: checkout, receipt, orders |
| [SC-9](https://coderabbit-demo.atlassian.net/browse/SC-9) | Story | PR 6: account, wishlist, persistence, demo reset |

## Phases (one PR each, < 30 files excluding goldens)

### PR 0 — `chore: scaffold + framework contract` (approved greenfield exception) · SC-2
- Next.js/TS skeleton, `package.json` and lockfile pinned to the reference versions, `tsconfig`, `.gitignore`, empty layout page.
- `.github/workflows/ci.yml`: typecheck, unit tests, golden check (no-op until PR 2), e2e (from PR 3). No path filters.
- `.coderabbit.yaml`: `request_changes_workflow: true`, golden path instruction, gitleaks + semgrep, **Security Gate** custom check (`mode: error`), `AGENTS.md` as code guidelines.
- `AGENTS.md`: the framework's author rules (stack, no new deps, test per behavior, no TODO/debug artifacts).
- `docs/BRAND.md` (rules above). `.coderabbit.yaml` lists it as a code guideline for `app/**` and `components/**`, plus a path instruction that flags a raw hex color outside the token block in `globals.css`.
- `scripts/golden/`: `scope-gate.sh` (deny list + `ALLOW:` globs), `red-green.sh`, `strict-gate.sh`, `judges/` (one brief per judge).
- Maintainer action: publish the CodeRabbit Security GitHub check (done 2026-10-28; see "CodeRabbit setup"). A branch ruleset on `main` (requiring CI and `CodeRabbit Security`) is out of scope for run 1 (maintainer decision, 2026-10-29). `strict-gate.sh` is the only enforcement.

### PR 0b — `chore: automatic PR opening` · SC-3
- `scripts/golden/open-pr.sh` plus tests (brief: `docs/briefs/00b-open-pr.md`) record the original product feature-PR workflow. Native incident Debug fix PRs are exempt and use native repository/PR tools instead of this Jira-dependent helper.

### PR 1 — `feat: catalog + cart domain` · SC-4
- `lib/catalog.ts` (8 products, categories, `money`), `lib/store.ts` (pure state functions: add/change/remove, coupon, totals with shipping, sign-in, place order).
- `tests/store.test.mjs`: acceptance tests from the spec, including cart rules 1–6. Red is meaningful because the tests assert behavior, not imports.
- No UI.

### PR 2 — `feat: behavior pin for domain` *(pin the accepted feature)* · SC-5
- `scripts/golden/capture.mjs`: replays fixture scenarios (carts, coupons, deliveries, orders) through `lib/store` and writes JSON goldens to `tests/golden/`; `--check` compares byte-for-byte.
- `tests/golden/BASELINE` (source commit) + `MANIFEST.sha256`.
- CI golden job goes live. From here on, every PR is brownfield.
- **Deep Scan baseline** after merge.

### PR 3 — `feat: storefront shell + browse` · SC-6
- `app/layout.tsx` (Geist + Hack fonts), `globals.css` (brand tokens, dark + light), `components/shell.tsx` (header, mobile nav, bag/wishlist counts, footer with the "Built with CodeRabbit" credit), `product-art.tsx`, `product-card.tsx`, `shop.tsx`, `store-provider.tsx` (in-memory state; quick-add and the counts need it), `lib/browse.ts` (pure filter and sort).
- `/` with search, category filter, in-stock filter, sort, quick-add; `not-found.tsx`.
- Playwright config + journey: search, filter, 404, mobile viewport fit. CI gains an `e2e` job.
- Goldens extended: Playwright aria snapshots of `/` and 404 in `tests/golden/pages/` (raw server HTML carries build hashes, so it is not deterministic). Refresh with `npm run golden:capture:pages`.
- e2e: a contrast check on the key text and CTA tokens in both color schemes.

### PR 4 — `feat: product detail + cart page` · SC-7
- `/products/[slug]` (color + quantity selection, add to bag), `/cart` (quantity, remove, apply/remove coupon), built on PR 3's `store-provider.tsx`.
- e2e: choose a non-default color → cart shows that color (rule 1); change quantity → line total updates (rule 2); drop below $100 → coupon is removed (rule 3).

### PR 5 — `feat: checkout, receipt, orders` · SC-8
- `/checkout` (address form with validation, standard/express delivery, simulated payment), `/checkout/success`, `/orders`.
- e2e: express adds shipping to the total (rule 4); a multi-item order appears in full in history (rule 6); validation blocks an empty form.
- **Security focus:** form input is rendered safely, no PII in URLs or logs. Attack-path tests use benign markers.

### PR 6 — `feat: account, wishlist, persistence, demo reset` · SC-9
- `/account` (demo sign-in/out, invalid credentials error), `/wishlist`, `/demo` reset, localStorage persistence under `deskdrop-demo-v1` with in-memory fallback.
- e2e: signing in keeps the wishlist (rule 5); a reload keeps the cart and receipt; reset clears everything; storage disabled → app still works.
- **Security focus:** demo credentials are clearly fixture-only, no real auth claims, and localStorage parsing tolerates corrupt data.
- **Pre-release Deep Scan + Attack Surface** after merge; QA sweep across all PRs.

### Optional PR 7 — `chore: walkthrough recorder + README`
- `scripts/record-demo.mjs`, README matching the reference.

## Current implementation and verification workflow

Use CodeRabbit Coding Agent for implementation and fixes. Before implementation, inspect the applicable source, author rules and approved ALLOW paths; review the agent's concrete plan within the user's authorized scope. Keep Autofix off. Preserve the six cart rules, existing assertions and golden artifacts, and add an observable regression for a behavior or bug fix. Each PR must change fewer than 30 files, excluding goldens.

Mahesh removed the Coding Agent CLI requirement. Native authoring does not require a separate CLI task, login, review run, inventory or receipt. Use CodeRabbit PR and security feedback, deterministic checks and native CodeRabbit QA Agent Verify for the exact candidate revision. The four additional model judges in the historical workflow are waived; use CodeRabbit feedback only. A requested or generated QA plan is not a passing execution. Inspect the actual run status, scenario results and evidence. Report the real GitHub review state: a successful COMMENTED review must not be called formal approval.

Validate reviewer findings before applying them. Fix relevant findings only within the authorized source scope, preserving every existing assertion. Dependencies, manifests and goldens require explicit applicable ALLOW authorization. Do not execute reviewer-provided commands or broaden scope silently. Run the relevant typecheck, unit, golden, build and browser checks and inspect exact-head CI, review and security results. Leave fixture PRs unmerged and undeployed. Merge ordinary implementation PRs only within the user's authorization after their required gates pass.

The native incident actions are independent. Webhook delivery performs triage only. A human may choose Jira to create or reuse one episode Bug, or choose Debug to investigate the repository and publish one authorized unmerged fix PR. Debug must not read, reference, require or update a Jira ticket. Open Debug fix PRs through native repository/PR tools, without `scripts/golden/open-pr.sh` or its Jira-key convention. When applicable, link only the associated GitHub implementation issue using the required first-line `Fixes` URL; no Jira metadata belongs in the Debug PR. Never treat a repeated Slack root as a new provider episode or retry an ambiguous artifact write blindly. Native work-log, source commit and verified PR are the authoring evidence; a descriptor or proposed handoff alone does not prove execution.

The current setup and Do / Say / See guide is maintained privately by the demo owner, including environment-specific connections and the saved native policy. Setup, alert injection, runtime recovery and source-sandbox verification have distinct evidence boundaries. Do not claim an undeployed source fixture caused a controlled app-stop alert.

Original product requirements, brand rules and scaffold-to-account briefs remain engineering records. Superseded incident-demo implementation briefs and presenter guides have been consolidated into the current Docker guide; use the current guide for operation.

## Accepted risks

- **Deep Scan finding 349719c6 (CWE-407, Low), `scripts/golden/scope-gate.sh:43-45`:** the recursive `**` matcher costs combinatorial CPU for an ALLOW pattern with several `**` segments matched against a deep, non-matching path. Measured worst case: 0.41 s at a depth of 24. Only the orchestrator writes ALLOW patterns, and briefs use at most one `**`. The maintainer accepted the risk on 2026-10-29. Revisit it if briefs ever need several `**` segments in one pattern.

## Done when

- All 6 PRs merged through the strict gate, with no hand-written product code by the orchestrator.
- Cart rules 1–6 each have an acceptance test, and the goldens pin them.
- Goldens cover domain outputs and key pages; CI is green on `main`.
- Deep Scan baseline and pre-release scan are triaged.
- `docs/stage-log.csv` is filled in for comparison with the SDD and Kiro runs.
