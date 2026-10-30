# mmani-shopping-cart — Phased Implementation Plan (Golden Framework, run 1 of 3)

**Target:** rebuild the DeskDrop storefront from `coderabbit-demo/qa-agent-demo` (read-only reference) into this repo, one PR per step, using the Golden Framework v1.0.
**Mode:** Greenfield. Each feature becomes golden-pinned once accepted; later steps run as brownfield features.
**Stack (same as reference):** Next.js 16, React 19, TypeScript 7, `node --test` unit tests, Playwright e2e, localStorage only. No backend, no new dependencies beyond the reference `package.json`.

## Roles (this run)

| Actor | Who |
| --- | --- |
| Maintainer | Mahesh. Approves this plan, each brief, any golden change, any skipped Critical/Major, and each merge. PRs open automatically |
| Orchestrator | Claude Code. Writes briefs, validates findings, runs gates. Writes no product code |
| Author | CodeRabbit Coding Agent: `coderabbit code new` / `resume` / `push`. One task per step, one fix task per review round |
| Judges | 4 read-only judges, none the author's model: scope, behavior/goldens, tests, security/hygiene. Scope, tests and security run as Opus subagents. **Behavior runs on Codex** (`codex exec -m gpt-6.1-sol -c model_reasoning_effort="xhigh" -s read-only - < judge-brief.txt`, prompt on stdin, run in the foreground; passing a long prompt as an argument or running it in the background got the process killed with no output), so not every judge shares one model's blind spots |
| Gate | CodeRabbit review + PR Security Review + the `CodeRabbit Security` check + the Security Gate pre-merge row + CI, on the exact head commit |

## Simplifications for run 1

Keep the comparison against SDD and Kiro fair and the overhead low:

- The scope gate, red-then-green and strict gate are **small shell scripts** in `scripts/golden/`, not a service.
- The four judges run as parallel subagents from the orchestrator, not in CI.
- QA Agent (`@coderabbitai test`) is requested on every feature PR and swept after merge; it never blocks the merge.
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

Requirements and per-PR acceptance criteria live in the Jira project **ShoppingCart (`SC`)** at coderabbit-demo.atlassian.net, labeled `mmani-shopping-cart`. Each PR names its issue key in the description (`Jira: SC-N`) so CodeRabbit's linked-issues check can validate the PR against that issue's acceptance criteria. When a plan item changes, update its Jira issue in the same step.

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
- `scripts/golden/open-pr.sh` plus tests (brief: `docs/briefs/00b-open-pr.md`). From PR 1 on, every PR is opened by this script once verification is green.

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

## Per-step loop (what the orchestrator runs)

1. **Check outside facts, then write the brief** in `docs/briefs/NN-*.md`: scope, `ALLOW:` globs, acceptance tests, required checks, what to report. Before writing, the orchestrator verifies every outside fact the brief relies on against the real system, not memory:
   - the check names the repo actually emits (`gh api …/check-runs` on a recent head);
   - CLI flags (`--help`);
   - the target platforms (macOS, with bash 3.2 and Node 22 or later; Ubuntu CI; Windows only for portability in tests);
   - CodeRabbit setting states.
   Each verified fact is listed in the brief under `## Assumptions (verified)`.
2. `coderabbit code new` with the brief, as a **normal task** that starts by asking for a plan ("write a plan, make no code changes until I approve"). Do not use `--plan`: a plan-mode task cannot be continued as a coding task. After the maintainer approves the plan, continue in the same task with `coderabbit code resume -m`.
   - In the task's web UI, Autofix stays **off**. The Run CLI review switch is per task and does not carry over (checked 2026-10-28), so the plan doesn't depend on it.
   - **CLI review rule (maintainer decision, 2026-10-28):** at least one completed CodeRabbit CLI review must run before the PR is created. The orchestrator runs it in step 5 on the pushed commit: `coderabbit review --agent --type committed --base-commit $(git merge-base origin/main HEAD)`. That is read-only and writes no code, so authorship is unchanged. Its findings go through the usual triage: fixed in a fix round, or listed as skipped with a reason. If the agent's in-task review also ran, that's a bonus, not a substitute.
   - Autofix stays off because it acts on PR review comments before the orchestrator has validated them.
3. **The Coding Agent's own CLI review** happens before it finishes, under the rule every brief carries:
   > Before finishing, run `coderabbit review --agent --committed --base main`. Fix valid findings only within the ALLOW globs, with a test for each behavior or security fix. In the report, list every CLI finding as fixed or skipped, with the reason. Never change a file outside ALLOW to satisfy a finding; report it instead.

   The orchestrator checks that list. A skipped Critical or Major needs the same validation as a PR finding.
4. `coderabbit code push` to the task's working branch → `scope-gate.sh` twice: the round's diff against its own ALLOW list, and the whole branch (from the merge base with `main`) against the brief's ALLOW list plus every approved fix-round ALLOW list → deterministic fixers (format, safe lint) as a labeled commit.
5. Verify in parallel: the required checks on the orchestrator's machine (macOS) and in CI, the 4 judges, and red-then-green for every new test (against `main`, or the previous head in a fix round). Two cases are proven by the tests judge instead of red-then-green: static guards that scan the test files themselves, and tests of **brand-new modules** (the module doesn't exist on the base, so red there proves nothing). Tests use plain static imports. Never shape a test to manufacture a red: no dynamic imports or load-success assertions to turn a missing module into an assertion failure. Any failure → a fix round (step 7) before the PR exists.
   - **Judge briefs are unprompted.** Each judge gets the shared preamble, its own property brief from `scripts/golden/judges/`, the diff range and the brief or fix-round message, and nothing else. The orchestrator does not add hints, suspected bugs or areas to focus on, because hints anchor the judge.
   - **The scope judge also checks the brief itself:** whether every outside fact the brief assumes holds in the repo and environment (check names exist, flags apply, the platforms named are the real ones). A brief that is wrong fails the scope judge just as a diff that strays from the brief does.
   - **Judge notes are never dropped.** Every judge note of Minor or higher goes into the next fix round, or into the PR body under "Skipped findings" with a reason. The orchestrator does not decide silently.
6. **Open the PR automatically.** When step 5 is all green, `scripts/golden/open-pr.sh` opens the PR with no maintainer prompt:
   - title from the brief;
   - body starting with `Jira: SC-N` (the step's issue), then the validation results, judge verdicts, red-then-green lists, the CLI-review list and skipped findings;
   - then a `@coderabbitai test` comment.
   Until that script lands, the orchestrator runs the same `gh` commands.
7. Fix rounds: validate the findings, put all valid ones in **one** Coding Agent fix task with one regression guard each, then push once. Each fix-round message carries the CLI-review rule too. After a fix round on an open PR, re-verify (step 5) and push; the PR updates itself. **Fix rounds after the PR opens need no CLI review** (maintainer decision, 2026-10-28). `coderabbit code push` lands the fix on the PR branch, and CodeRabbit's PR review runs on that push automatically, with fuller context. The strict gate then needs that review to be clean. If reviews auto-pause, step 8 resumes them.
8. **Wait for CodeRabbit's review of the exact head.** CodeRabbit pauses automatic reviews after `reviews.auto_review.auto_pause_after_reviewed_commits` reviewed pushes (default 5; PR 0 hit it after 6 pushes). If the head has no review and the PR shows reviews paused, comment `@coderabbitai resume`. PR 0b raises the limit to 10: each push in this loop is one verified fix round, and the cap stays as a backstop.
9. `strict-gate.sh`: CR approved, 0 unresolved threads, no Crit/Major in the latest review, CI and the `CodeRabbit Security` check green, and the Security Gate row passed in the pre-merge checks table. Then merge.
10. Log the stage times; QA sweep. **Until the post-merge automation (`docs/automations/post-merge-sweep.md`) is set up (deferred 2026-10-28), the orchestrator does this step by hand after each merge:** read the PR's QA Agent result, file product defects as `qa-sweep` Bugs under SC-1, comment the result on the PR's `SC-N` issue, link the PR, and move the issue to Done.

**Maintainer checkpoints:** the plan and each brief (scope), the Coding Agent's plan for each step, any golden change, any skipped Critical/Major finding, and the merge. Opening a PR is not a checkpoint.

**Why these rules (lessons from PR 0):** CodeRabbit raised 5 Major findings across three reviews of PR 0. Of those, 2 traced to errors in the brief, 1 to a judge note the orchestrator downgraded, and 1 to a judge prompt that steered attention elsewhere; the fifth was invalid and was withdrawn. A third brief error ("Security Gate" described as a GitHub check) surfaced when the strict gate first ran. The pre-PR CLI review, the brief-assumption check, the no-silent-drop rule and unprompted, mixed-model judges each target one of those causes.

## Accepted risks

- **Deep Scan finding 349719c6 (CWE-407, Low), `scripts/golden/scope-gate.sh:43-45`:** the recursive `**` matcher costs combinatorial CPU for an ALLOW pattern with several `**` segments matched against a deep, non-matching path. Measured worst case: 0.41 s at a depth of 24. Only the orchestrator writes ALLOW patterns, and briefs use at most one `**`. The maintainer accepted the risk on 2026-10-29. Revisit it if briefs ever need several `**` segments in one pattern.

## Done when

- All 6 PRs merged through the strict gate, with no hand-written product code by the orchestrator.
- Cart rules 1–6 each have an acceptance test, and the goldens pin them.
- Goldens cover domain outputs and key pages; CI is green on `main`.
- Deep Scan baseline and pre-release scan are triaged.
- `docs/stage-log.csv` is filled in for comparison with the SDD and Kiro runs.
