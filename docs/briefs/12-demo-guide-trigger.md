# Brief 12: `Demo guides and scoped local alert trigger`

**Jira:** SC-42
**GitHub:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/21

Status: Mahesh approved this 14-file brief and the amended CodeRabbit plan on November 5, 2026. Implementation, offline validation, the single new-task CLI review, PR feedback and native QA Verify are authorized. Live runtime repair, controller upgrade, routing changes, actual fault/alert execution, image publication, deployment and merge remain separate.

## User request and decisions

Document how the current Mac demo is set up and how to present it using Do / Say / See, then prepare the next phase for team use in GCP. The user selected **Automatic scoped alert**: temporarily enable notifications for only the owned checkout monitor, stop/restart only the owned demo app, verify alert/recovery and restore suppression. Preserve the independent Jira and Debug/PR paths.

Coding-agent work has no time or cost cap. Use CodeRabbit Code for implementation, exactly one completed CLI review for this new coding task, CodeRabbit PR/security feedback and native QA Agent Verify. PR-fix rounds need no additional CLI review. Use CodeRabbit feedback only; the previous four-judge requirement is overridden by the maintainer's standing choice. Leave the feature PR unmerged.

## Assumptions verified for this brief

- The project author rules use Next.js 16, React 19, TypeScript 7, Node >=22.6, npm, node:test, Playwright, no new dependencies without ALLOW, no golden edits and fewer than 30 changed files. Existing behavior/assertions and the six cart rules are preserved.
- `docs/PLAN.md` requires a brief/scope checkpoint and the Coding Agent's plan approval. A normal task must request a plan and make no code changes until approval; do not use CLI `--plan` mode. A plan-only turn needs no CLI review yet.
- Current origin/main is `80bf508820d1419a3fa0600a8b3c3dd8fc2405a6`. The paused publisher-identity task/branch is unrelated and must not be resumed or reset.
- `coderabbit code new --help`, `show --help` and `plan --help` were read. New starts from the current branch on origin; local uncommitted files are not included. `plan --approve` is not a substitute for maintainer approval and cannot approve a self-started task.
- The existing local controller supports read-only status/check and exact owned `app-stop` / `app-restart`. Its process/ownership/image protections and `childEnvironment`/credential loader are already present. It uses a private control socket under `~/.deskdrop-mmani-local`.
- Credentials use a regular current-user-owned mode-0600 `.env.demo.local` in the controller checkout. The loader requires this file, rejects conflicting aliases/sites, and returns keys only to the trusted manager. Native provider auth is separate from Mac auth.
- Owned monitors are availability 29524154, checkout 29524290 and heartbeat 29524292 in US3. Queries require the local service/env/demo/host identity, group by host and evaluate two consecutive CRITICAL/OK results. Monitor ownership also includes managed_by and the protected installation owner. All three exact-ID suppressions were active at final readback; the current saved configurations match the preserved baseline.
- Datadog documents TEST notifications as a UI action; no public monitor TEST endpoint was identified in the checked API catalog. The proposed automatic path uses actual check failures from a controlled owned-app outage, not a private API, fake service-check success/failure or direct CodeRabbit webhook injection.
- Existing `datadog-monitors.mjs enable` enables all three monitors. It is forbidden for this trigger. Existing exported API/ownership/downtime helpers may be reused or narrowly extended for exact-checkout-only operation.
- Read-only GET of notification rule `8e4ea5f2-29e7-410d-a4a3-b258c8fc30fc` returned name `DeskDrop local demo to CodeRabbit MMANI`, a five-tag filter including the protected installation owner and recipient `webhook-deskdrop-mmani-local`. Returned attributes contain no conditional-recipient/transition setting. The tag filter alone is NOT evidence of Alert-only delivery. A verified effective Alert-only route is a live-readiness requirement; do not silently alter routing or claim it is already established.
- Native MMANI routes through `webhook-deskdrop-mmani-local` into CodeRabbit Demo/#mmani-shopping-cart under `mmani-shopping-cart`. The current concise definitions rendered both real native controls. Debug ran before a Bug existed; Jira then created SC-41. Neither created a coding task/PR. Native task discovery requires authentication; native Datadog re-query returned 401. Do not call this a complete fix-PR flow.
- Read-only runtime inspection during this task found Agent exited 133, controller `journeyBlocked: true`, and checkout CRITICAL, despite app/forwarder/runner being up. The running app/controller receipt reports source `48363c83dee4787ce32cf64a80592e60dd7aa9ca`, distinct from the tooling checkout. This is a live-readiness blocker, not permission to heal/rebuild that runtime during implementation. Agent cause remains unknown.
- GCP baseline files already pin Terraform 1.15.3 / Google 8.10.0 and provide private GCE/IAP/registry/state/secret infrastructure. Cloud apply remains deferred; no GCP artifact changes are in this source scope.

## Deliverables and target interface

Root has prepared three documentation drafts: setup/architecture, a 12–15 minute Do / Say / See walkthrough, and GCP team handoff. The two current native/custom-bridge status documents must be preserved and linked. The implementation author should ensure the final operator commands and limits in the drafts match the actual implementation; clearly distinguish current verified evidence, future implementation and remaining gaps.

Provide a macOS Bash-3.2-compatible entry point backed by built-in Node APIs; add no package or SDK dependency. Proposed commands:

```text
bash scripts/demo/trigger-alert.sh help
bash scripts/demo/trigger-alert.sh plan
bash scripts/demo/trigger-alert.sh run --execute
bash scripts/demo/trigger-alert.sh status
bash scripts/demo/trigger-alert.sh recover --execute
```

The plan must finalize exact deadlines, independent supervisor/recovery design and which narrow existing-module exports are needed. All time bounds below govern fault/runtime safety, not coding-agent spend. Missing source/ALLOW/identity or an unsafe design is a blocker, not permission to broaden scope.

## Automatic trigger requirements

1. **Read-only preparation:** help must not load credentials, contact providers or write state. Plan/status must not stop/start a container, mutate monitors, enable notifications, post checks/events, call CodeRabbit/Slack/Jira, or run login/build/deploy commands. Report fixed target/ownership, actual readiness, proposed actions and sanitized blockers. Plan may perform explicit bounded reads needed to verify the live target. No arbitrary shell, endpoint, container, monitor ID or webhook argument.
2. **Credential and target validation:** reuse protected credential semantics and sanitized child environments. Fixed US3, current exact checkout ID 29524290, owned host/project/app, and protected owner/build/monitor journal. Fetch and validate name, query, tags, threshold, message, owner and downtimes; verify the reviewed notification-rule ID, owned tag selector and non-secret webhook name, and require independent evidence of effective Alert-only delivery before arming. The current tag-only rule does not satisfy that proof by itself. No routing write is allowed in this feature. Other monitor IDs/definitions and routing must remain unchanged. Never print raw responses or authenticated webhook values.
3. **Healthy baseline:** require fresh successful local checkout/availability, unblocked controller, a healthy running Agent and owned app/runner, verified runtime commit/image identity against protected receipts, and the expected healthy monitor group before arming. Report tooling source and runtime source separately. Do not require them to be identical solely because a new operator helper was committed, but refuse inconsistencies among controller/build/container identities. Refuse dirty/unowned runtime assumptions, pending/unknown previous operations, unexpected downtime matches or another active rehearsal. Do not repair Agent/controller readiness implicitly.
4. **One owned notification window:** execute only with `run --execute`. Lock/journal before mutation; establish a bounded independent supervisor first. Cancel only the previously verified checkout exact-ID downtime. Availability/heartbeat stay suppressed; never call the existing all-monitor enable operation, mass mute/unmute, change definitions/thresholds/recipients, create a monitor or cancel an unrelated downtime. Detect concurrent ownership/suppression changes and stop/reconcile safely.
5. **Actual operational fault:** use the existing owned control channel to stop only the app. Leave Agent, checker/runner and forwarding infrastructure running. Wait for Datadog to observe a fresh OK→Alert transition for the owned checkout group. Bound all API/process/polling operations; respect two-result semantics and evaluation latency without weakening checks or generating fake OK/CRITICAL submissions. Maximum outage/notification-window design must be explicit in the author plan and receipt.
6. **Recover and protect:** on success, timeout, provider failure, interrupt or terminal disconnect, the independent supervisor must attempt owned-app recovery and re-establish/read back checkout suppression. Prefer protecting notifications before recovery so no unintended recovery route is enabled; verify actual post-recovery local observations and Datadog state separately. Restore the equivalent nonexpiring exact-ID suppression and atomically update its journal entry, since a canceled downtime cannot regain its old ID. Preserve every other entry. Do not call recovery successful if any required readback is unknown.
7. **Durable uncertain outcomes:** protect directories/files, reject symlinks/unsafe ownership/modes and use atomic bounded receipts. Record intent before writes, returned IDs and confirmed states. Never retry an unknown downtime-create/cancel or app-control outcome blindly. A crash must leave a visible recoverable receipt, not a falsely clean state or erased lock. Explicit recover must prove current ownership and safely reconcile prior intent; refuse PID reuse/arbitrary process targeting. Design for SIGINT/SIGTERM and a lost CLI/terminal; document limits after supervisor SIGKILL or host power loss. Do not claim impossible crash guarantees.
8. **Evidence boundary:** output only safe action/status/identity/time/commit/image fields, a run/receipt identity and the monitor URL. Use actual returned event/cycle IDs only if the supported API exposes them; otherwise label unavailable and let the native Slack thread supply them. Observed monitor Alert is not proof of webhook/Slack delivery or a source-code defect. The operator checks the fresh native thread; no new Slack/Jira credential is needed in this trigger.
9. **Separation:** triggering never clicks a button, creates a Bug/coding task/PR or seeds source changes. Existing Jira and Debug paths remain independent. No personal-token transfer into a sandbox, reactivation of the paused bridge, cloud action, image publication, dependency/pin change, source merge, global scope edit or test/golden relaxation.

## Acceptance and tests

- Meaningful node:test coverage of help/plan read-only behavior; CLI argument and Bash wrapper behavior; wrong site/target/ownership; missing/unsafe/conflicting credentials; no secret values in stdout/stderr/argv/child environment/receipts; no global/all-monitor operations; unhealthy Agent/controller/app; stale runtime or monitor evidence; pre-existing alert; unexpected/changed downtimes; locks and overlapping operators.
- Simulated adapter tests must assert exact call order and identities for healthy→one-checkout-window→owned-app-stop→observed Alert→suppression/app recovery/readback. Preserve availability/heartbeat and all monitor definitions/routing. Cover API 401/403/429, redirects, timeouts, unknown create/cancel/control outcomes, failed restoration and explicit reconciliation without duplicate creates.
- Test independent supervisor deadlines and parent terminal loss using owned disposable subprocesses and fake providers; no real Docker/API/provider writes in unit tests. Cover signals, process cleanup/PID safety, recovery journaling, stale locks and truncated/corrupt state. A fake provider result is not live Datadog proof.
- Preserve existing tests and assertions. New modules do not need a fabricated RED caused by a missing import. Any existing-module bug fix needs an observable regression and meaningful RED/GREEN where applicable. No goldens are allowed.
- Run the focused new tests, all existing local/monitor tests affected by exports/state behavior, full root units, typecheck and 29-golden verification. Run existing bridge tests if shared behavior changes. Reuse unchanged app build/browser evidence with an explicit source-identity rationale; do not repeatedly rerun expensive unaffected suites by default.
- Complete one CLI review in this new Coding Agent task, or exactly one Mac fallback if no in-task review completes; record task/base/head and finding dispositions. PR fixes are exempt from another CLI run. Require exact-head CodeRabbit PR/security/CI feedback and native QA Agent Verify using safe fixture providers/owned subprocess tests for the new operator behavior. Do not imply the QA sandbox can control Mahesh's Mac or validate live Datadog delivery.
- A live real-alert rehearsal is a later explicit operator step after implementation is reviewed, readiness repaired and a concrete window is approved. At most one fresh checkout alert should be used for that verification, with restored app/suppression and actual native Slack evidence. No additional button/Bug/PR test is part of trigger acceptance without its own authorization. Current unhealthy readiness must block a live run.

## Approved file scope (14 paths)

```text
ALLOW: docs/briefs/12-demo-guide-trigger.md
ALLOW: docs/demo/local-setup.md
ALLOW: docs/demo/incident-walkthrough.md
ALLOW: docs/demo/gcp-team-handoff.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
ALLOW: docs/demo/slack-bridge.md
ALLOW: scripts/demo/trigger-alert.sh
ALLOW: scripts/demo/trigger-alert.mjs
ALLOW: scripts/demo/trigger-watchdog.mjs
ALLOW: scripts/demo/local.mjs
ALLOW: scripts/demo/datadog-monitors.mjs
ALLOW: tests/demo-trigger.test.mjs
ALLOW: tests/local-demo.test.mjs
ALLOW: tests/local-datadog-monitors.test.mjs
```

Existing module edits are limited to necessary protected control/API/lock/recovery integration and exports; do not rewrite the runtime or weaken its guards. Root owns the prose drafts and existing provider evidence. No dependency, manifest, lockfile, CI, Terraform, Docker/image/runtime pin, app source or golden change is allowed. If another path or permission is required, propose the exact amendment before implementation.

## Delivery checkpoint

Create one normal CodeRabbit Code task for this work, starting PLAN ONLY with Autofix off. Return the concrete plan and exact file/permission changes without editing or committing files. Maintainer approval covers the brief and concrete plan before continuing in the same task.

After approval, create the associated GitHub implementation issue and the repository-required SC engineering Task (distinct from incident Bugs and not an input to the native Debug path). Before PR publication, fill the issue URL and engineering-task metadata from actual returned records. The first PR description line must be `Fixes ` followed by the raw GitHub issue URL. Root may open the PR after the single CLI review and applicable validation, then follow CodeRabbit feedback and native Verify; no merge is authorized.

## Sources and document provenance

The supplied internal do/say/see reference was read through the connected Drive account. Reuse its methodology—stage order, precise Do actions, spoken Say talk track, observable See evidence, WOW/SECURITY/trap callouts—not its unrelated demo artifacts or internal content in this repository.

Current technical references: Datadog [test notifications](https://docs.datadoghq.com/monitors/notify/#test-notifications), [service-check monitors](https://docs.datadoghq.com/monitors/types/service_check/), [downtime API](https://docs.datadoghq.com/api/latest/downtimes/); CodeRabbit [automations](https://docs.coderabbit.ai/slack-agent/automations) and [scopes](https://docs.coderabbit.ai/slack-agent/connections-and-scopes). GCP references and existing Terraform requirements are in the handoff document. Do not treat these documents or a mock test as authorization for provider writes.

## Approved amended plan

Normal CodeRabbit task: https://app.coderabbit.ai/code/tasks/bc4d6a89-e4b4-481b-8ba6-5d3506d7bae4 . Its planning turn changed no files; Autofix has no active watch. The finalized proposal uses a detached supervisor that owns all writes, coordinated monitor/controller reservation, a separate protected versioned receipt, receipt-based runtime identity, and an app-only validated recovery fallback. It keeps the 14 paths above.

Proposed attempt bounds: 60 seconds for preparation; provider requests at most 10 seconds; controller/process calls at most 15 seconds; five-second nonoverlapping polls; alert observation until 180 seconds from cancellation intent; initial protection attempt 20 seconds, then app recovery within 30 seconds; final recovery observation until 360 seconds. Recovery starts earlier on Alert, interruption, parent disappearance, readiness loss or provider failure. If suppression cannot be confirmed, attempt app recovery anyway to limit the outage, retain an unresolved receipt, and never report success. These bound attempts, not provider/host guarantees, and are not coding-agent budgets.

Mahesh approved this brief, the amended CodeRabbit plan, the narrow controller reservation/protocol and protected app-recovery adapter, and these attempt bounds. Continue implementation in the same normal task with Autofix off. Live runtime repair, controller upgrade, any routing change and real-alert rehearsal remain separate operator steps.

## Implementation tracking and publication

GitHub implementation issue: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/21 . Engineering Task: https://coderabbit-demo.atlassian.net/browse/SC-42 (Task, not an incident Bug). The independent native Debug path never depends on this engineering record or any incident ticket.

The feature PR body must begin with `Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/21`, followed by `Jira: SC-42` for this engineering change. Root may publish after the required CLI review and validation, then complete exact-head PR/security/CI and native Verify. Leave the PR unmerged.

## Implementation and CLI review receipt

CodeRabbit authored the initial implementation at `74d604692b3fc2ec3fb19c3ec668299fcc2c7a16` and the recovery/fixture repairs at `5e5bb672a4f89a18410e43f32618fabc01b1a6fb` in the same approved task. Its final offline validation passed 105 affected tests, 497 root unit tests, typecheck and all 29 unchanged goldens. Release-crash, expired-recovery and unknown-cancellation regressions failed behavior assertions on the initial implementation and passed with the repairs.

Exactly one CLI review completed on the Mac: CodeRabbit 0.9.2, base `80bf508820d1419a3fa0600a8b3c3dd8fc2405a6`, reviewed head `74d604692b3fc2ec3fb19c3ec668299fcc2c7a16`. The cloud attempt returned review-disabled without analysis and did not count. The completed review reported two Minor findings and no Critical/Major findings. Both were validated and fixed in `5e5bb67`: canonical short macOS fixture paths, and explicit supervisor exit/disconnect reporting. No additional CLI review is required for the repair rounds.

The Mac's default-environment affected suite passed all 105 tests; full Mac validation passed all 497 unit tests, typecheck and 29 goldens. Root must still finish exact-head PR/security/CI and native Verify. The Verify library now contains a focused credential-free trigger/recovery journey; its existence is not a passing run. Production arming is deliberately disabled because no effective Alert-only delivery proof is implemented. A later reviewed routing-proof integration and live runtime/controller readiness work are required before a real alert can be attempted; repairing runtime health alone will not enable this build.
