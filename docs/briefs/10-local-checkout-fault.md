# Controlled local checkout fault and isolated remediation

Status: PROPOSED. This brief is reviewable preparation only. It authorizes no seed, push, notification, incident, task, issue or PR until Mahesh approves the bounded rehearsal and CodeRabbit Code plan. No repository file has been changed by preparing it.

## Concrete seed

Repository: coderabbit-demo/mmani-shopping-cart. Exact healthy base: `48363c83dee4787ce32cf64a80592e60dd7aa9ca`.

Create the isolated branch `codex/demo-checkout-fault` from that exact base, using a separate suitable checkout/worktree. CodeRabbit Code authors and commits exactly this intentional defect in `lib/store.ts`, exported `totals()`, line 146 at the base:

```diff
-  const shippingCents = state.delivery === "express" ? 1200 : 0;
+  const shippingCents = state.delivery === "express" ? 2400 : 0;
```

The seed scope is one file and one numeric literal. Standard remains free; DESK15 remains unchanged. The existing two-item journey becomes $100 subtotal minus $15 discount plus $24 express = $109, instead of $97. The UI's express-option label still promises $12, making the defect visible without introducing a new feature.

ALLOW: lib/store.ts

No dependencies, package files, test edits, goldens, monitoring definitions, credentials, infrastructure, runtime versions or main-branch changes are allowed for the seed. Preserve every existing test and assertion. This deliberate isolated violation of cart rule 4 requires explicit approval; its expected RED results are recorded as RED, never as acceptance of healthy product behavior. Do not create a Jira seed-tracking Bug: Jira creation waits for the requested incident button. Reuse parent GitHub issue https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10 for branch/task context if needed. A seed PR is unnecessary; any required disposable GitHub issue must be within the bounded approval.

## Observable RED evidence

The unchanged unit tests `rule 4: express adds $12 and standard adds $0` (with and without coupon), `rule 4: cent-price regression includes express shipping after the rounded discount`, and order-total assertions fail. Run `node --experimental-strip-types --test tests/store.test.mjs` and retain loaded assertion failures.

`npm run golden:check` must fail existing express/cents/order scenarios, including `domain/cents-100-10.json`; never recapture goldens. The test `planted express shipping change fails naming the scenario` in `tests/golden.test.mjs` also expects the original 1200 literal, so the intentional seed causes its `assert.notEqual` to fail. Do not change that test to make the seed appear green.

The unchanged Playwright case `rule 4: DESK15 and express remain in all totals` in `tests/e2e/checkout.spec.ts` fails its shipping assertion ($24 versus $12). The local checker in `deploy/checker.mjs` asserts shipping before total: the actual bounded diagnostic should be `checkout_shipping`, expected `$12`, actual `$24`. Do not claim it emits `checkout_total` $97/$109 unless separately observed; the total is nevertheless $109 in the faulty UI.

Build and typecheck are expected to remain valid. The fault must not change HTTP availability, telemetry or heartbeat behavior.

## CodeRabbit workflow

Create a normal CodeRabbit Code seed task with a plan-only first turn, Autofix off, and no implementation until approval. Before finishing this new task, complete exactly one CodeRabbit CLI review using the approved syntax and a recorded base. Record task ID, seed commit, reviewed base/head, completion and every finding's disposition. The express regression is intentional only on this disposable branch; do not quietly dismiss a reviewer warning, and do not allow review autofix to erase the seed. No seed PR publication or merge into main is authorized.

After the real scoped Datadog event reaches the native Slack automation, initial triage creates no artifact. `Create Jira Ticket` creates or reuses one SC Bug. `Debug and Create PR` reuses that same episode's SC Bug and starts the CodeRabbit Code remediation task. The two buttons are independent; use monitor ID + environment + Datadog alert-cycle key as episode identity, retain event ID separately, and stop on missing or ambiguous identity. Do not claim atomic concurrent-click safety from prompt-only lookup.

The remediation task starts from the exact faulty seed commit on a separate branch such as `codex/demo-checkout-fix`. Its PR base MUST be `codex/demo-checkout-fault`, never main. Fix scope:

ALLOW: lib/store.ts
ALLOW: tests/store.test.mjs

Restore correct $12 express behavior and add one focused observable unit regression for the exact $100 basket + DESK15 + express = { subtotal: 100, discount: 15, shipping: 12, total: 97 }. Preserve every previous test/assertion and all golden bytes. Run that new assertion against the seed for RED and against the fix for GREEN, then units, typecheck, unchanged golden check, production build and relevant Playwright checkout/receipt/history cases. One completed CLI review is required for this new remediation coding task before publication; later fixes to that already-open PR are exempt. Require exact-head CodeRabbit PR feedback, Security result and native CodeRabbit QA Agent Verify evidence. QA sandbox proof does not replace actual Mac rebuilt-image proof. PR body first line: `Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10`; identify the incident SC Bug separately and state the isolated PR base. Do not merge or deploy automatically.

## Local image and runtime requirements

Both seed and remediation must be clean committed sources. The normal controller builds immutable per-commit app AND checker images from a Git archive (`node scripts/demo/local.mjs build`), verifies source labels/IDs, and starts from the matching build record. Never reuse the healthy source's image while claiming a seed, or use the fixed source while claiming the faulty image. Keep existing journals/build records and preserve loopback3177, pinned amd64 images, secret boundaries, container ownership, seccomp and resource restrictions. Never publish images or perform GCP actions.

Known sequencing gate: `build()` requires port3177 free; normal `stop` restores suppression; `start` requires active owned-ID suppression; `enableOwned()` requires all three current monitor groups to be OK. Therefore a persistently faulty replacement image cannot be enabled after its checkout group has become Alert through a straightforward stop/build/start/enable sequence. This brief does NOT authorize bypassing those guards, racing stale OK, editing protected journals, injecting fake healthy telemetry, or introducing an unreviewed hot-swap control. Resolve and review a supported transition before claiming a live seeded-fault rehearsal. A separately approved Datadog test notification may prove the native delivery/button path only if labeled as such; it does not prove automatic condition-triggered delivery or product recovery. App-stop alone proves outage handling, not a source defect suitable for this checkout fix PR.

## Bounded approval fields still required

Mahesh approves the seed and fix scopes/plans, disposable branch push and one local fault/recovery episode; the exact Slack workspace/channel and owned US3 monitor scope; a concrete start/end window; owner; and positive Agent usage cap. Maximum intended artifacts: one SC Bug, one remediation task and one PR (plus one CodeRabbit Code seed task); no merge, cloud apply, image publication or deployment outside the local harness. The protected notification approval record must use exact monitor IDs 29524154, 29524290, 29524292, fresh independent healthy evidence, verified payload/filter scope and the actual approved cap/window. Do not create fictitious approval values.

Before arming, verify authenticated native webhook configuration, actual payload mapping and exact IDs/tags, allowed-event acceptance plus unrelated-event rejection, saved first-reply buttons, channel posting, and effective Jira/GitHub/CodeRabbit permissions. Native delivery dedup does not prove artifact idempotency. Click Create Jira first and then Debug on the same episode for the minimum walkthrough; document replay, reverse order and concurrent actions as unverified unless actually exercised.

On completion or failure, restore exact-ID suppression and the clean known-good local image/runtime using the reviewed controller, confirm HTTP/checker/heartbeat recovery and US3 evidence, and leave isolated seed/fix branches unmerged. Do not delete or close artifacts without the bounded cleanup authorization. Keep credentials and webhook endpoints/headers out of all evidence.

## Suggested minimum timeline after prerequisites pass

1. Save/inspect native two-button prompt while monitors remain suppressed (parallel with PR16 gates).
2. Approve this concrete seed and CodeRabbit Code plan; author/CLI-review/push isolated seed. Build immutable seed images offline under the reviewed controls.
3. Resolve the runtime-transition gate above; only then authorize and execute the scoped, budgeted native event.
4. Confirm native Slack triage has both buttons and no issue/task/PR. Click Create Jira and inspect one SC Bug. Click Debug and inspect reuse plus one CodeRabbit Code task/isolated PR.
5. Retain at least ten minutes for suppression, recovery and evidence. If implementation/review/QA is still running, show its truthful status; do not declare end-to-end fix success from task creation alone.
