<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ecf7a383a888be46473e6068cf7327441eecb19effa2b2e1e1076a58681c1261 -->

# Brief 15: feat: GCP server-side trigger and operator handoff

Engineering acceptance: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/27
Parent live rollout: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/24
CodeRabbit task: https://app.coderabbit.ai/code/tasks/e146081f-598b-4955-af4a-32126e50b549

## Authorization and reviewed plan

Mahesh approved the bounded GCP package, routine brief/plan/scope/review/merge delegation, Mahesh-only pilot and up to $100 Google Cloud use for the first seven days. Use only existing mahesh@coderabbit.ai permissions; document any additional requirement without acquiring broader roles/identities. Coding-agent time/cost is uncapped. Target is November 6, 7 AM Pacific. No videos; actual high-resolution screenshots and written setup/Do–Say–See material.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ac3f722f7f9b24508260f75eb826900e190a2383087402c9029cd89f7c03d2db -->

Codex reviewed this task's plan-only response and approves its Python peer-credential broker/client, root-owned enrollment and journals, distinct trusted pinned Node control/recovery container, durable serial admission and independently supervised recovery, with the amendment below. The six additional paths for installer/test coverage and evidence/three actual screenshot slots and the delegated [cost worksheet amendment](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/27#issuecomment-6678233952) are approved: 23 allowed paths total. No new dependency, package or pin.

<!-- /coderabbit-ai-generated:v1 -->

Recovery amendment: always attempt the bounded restoration of the exact owned app even if Datadog suppression cannot be confirmed. Retain uncertainty and block new fault admission until effective suppression, app image/source/health and reservation release all reconcile. Do not leave the app down merely because a provider readback fails. This clarifies GH27 and preserves the existing local behavior. App restoration is not a claim that suppression or the whole recovery succeeded.

Parallel authoring is allowed in this isolated task for new protocol/helper/journal tests. Begin from the published monitoring snapshot, not an invented future interface. Foundation and monitoring are still under implementation/review; defer overlapping installer/runtime/monitor adapters and final validation until their reviewed final sources are supplied. Integrate both without overwriting work. No main-targeting PR until dependencies merge and this stage's complete diff stays below 30 paths. Report exact base/head and inherited changes honestly.

## Verified assumptions

- Main includes PR22 at 0f0c42fcff214a8b8fbfd5ee5813d79d351dd94c. PR23 is an isolated fixture and remains unmerged; custom bridge repair remains paused.
- Foundation snapshot 5e40a573e7f6554e33e91f71c09acf3ecbd26f5b fixes the two completed CLI findings (compressed source archives and output-only API metadata). A Mac shell-test-only correction is pending. This source is not merged and does not authorize cloud use.
- Monitoring brief 24de21c326db3ad0c2313f107b7cfb27780de49d and partial core 9faa889a2009d1b2fa1ec22951eba246a5307816 are published; executable services/suppression/host-bundle integration remain in progress. Inspect actual final interfaces before adapting shared files.
- Ubuntu bootstrap has Python3, systemd and Docker, not host Node. Reuse node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607 as the distinct trusted controller; do not assume Docker CLI inside it or add host Node/npm. Host Python may use the already installed fixed Docker client as needed; app/checker get no socket.
- Linux kernel peer credentials and actual systemd/reboot semantics require matching Linux validation. macOS/simulated boot tests are not VM evidence.
- User/ADC login works and billing/quota were observed sufficient. Existing project Editor does not establish tested IAM policy writes or IAP access. No GCP DeskDrop apply/API/IAM/secret/runtime write has occurred. Team group and second presenter are deferred, no guessed identity/grant.
- Engineering Jira Task create returned 403. No retry or alternate-provider bypass; no fabricated/reused SC key. GH27 is the delegated engineering acceptance record; use gh if the repo PR helper requires an unavailable Jira key. Incident Jira remains an independent live acceptance path.

## Required behavior and boundaries

1. Public interface addresses only the installed cloud instance: deskdrop-operator status, trigger and recover. Exact installed path/commands must be verified and documented. No actor-controlled project/host/path/image/env/shell/command or credential argument. Reject extra fields/arguments, oversized requests and malformed actions before mutation.
2. Existing Python3 helper sends a bounded request to a root-owned Unix socket. Root broker authenticates kernel-provided peer UID against a protected, explicitly enrolled OS Login principal mapping. Claimed request identities, USER, SUDO_USER and caller environment confer no authority. Enroll only verified actual OS Login mappings, revalidate before admission, fail closed on mismatch. No guessed Linux UID/group, Mac UID substitution or fallback actor. Public socket custody/access differs explicitly from root-only state; presenters get neither Docker nor sudo.
3. Root-only broker/worker/recovery service modes cannot be selected over the public protocol. Fixed executable paths, root-owned validated source/config/unit hashes and sanitized service environment prevent shell/command injection. Expose only sanitized status/receipts, never keys/tokens/provider bodies/private state. Management credentials go only to separate trusted lifecycle/recovery work; recurring monitoring remains management-key-free. No app/checker secret/socket/metadata access.
4. Admission verifies exact project/VM/installation, real release/host-bundle/source/image evidence, monitor ownership, complete effective Alert-only routing/suppression and healthy current monitoring. Foundation or offline sandbox receipts cannot authorize a live run. Persist intent and reserve the installation atomically before acknowledging; accepted means durable admission, not observed Alert/successful recovery.
5. Root-owned durable journal, operation intents and exclusive execution lock serialize competing trigger/recovery requests. Disconnect never releases a lease. Include immutable run/installation/boot identity, bounded deadlines and outstanding operations. Survive killed client/broker/worker, service restart and reboot. Never clear a lease solely because PID is absent or deadline elapsed. Unknown writes retain state and reconcile exact provider/runtime ownership before retry.
6. Open only the owned checkout notification window, stop only the exact app, keep recurring checks/heartbeat alive, and observe a fresh checkout Alert for at most 180 seconds. Do not affect local monitor IDs, runtime, shared scopes/routing or unrelated resources. No live provider/rehearsal actions in this coding task.
7. Independent boot-enabled recovery cannot admit faults and owns reconciliation even if caller/broker/worker dies. Each attempt is bounded to 360 seconds; repeated recover requests join the current attempt. Always attempt the exact owned app restart within that bound while independently restoring/checking suppression. Leave an explicit unresolved/degraded receipt if either is uncertain; do not falsely report recovered or reopen admission. Confirm app/source/health, effective suppression and reservation release before fully recovered. Preserve unknown intent across retry/reboot/clock rollback; fence late mutations and prevent overlapping workers.
8. On boot, start admission closed; independent recovery must reconcile durable/provider/runtime state before reopening. Bounded child cleanup leaves no owned orphan and preserves unrelated processes. Parent/child cancellation and provider timeouts cannot erase uncertain outcomes or authorize a second fault.
9. Reuse final stage13/14 receipt, installer, scheduler, owner-selector and suppression interfaces. Source-bound transfer/hash verification covers every installed import/helper/unit. Wrong actor/project/zone/registry/source/image/container/monitor/lease, unowned links or unsafe path modes fail before mutation. No personal Mac/browser dependency for hosted recurrence/recovery.
10. Preserve every existing local assertion/default/command, all goldens and six shopper rules. Native Jira and Debug/PR remain independent in either order. Debug investigates directly in actual repo/application with no Jira reference/prerequisite. A fix PR needs confirmed source evidence; deliberate app stop does not justify inventing a product bug. PR23 stays unmerged. Historical fixture proof is not live cloud proof.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ddde8ec680b8edb36c50cc8c1ebd8e73369e9ac9bd013389a4f008f28411fa80 -->

## Exact approved scope (23 paths)

<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7c5255875ee08cdda9b578d792bebf4c18e0570d7570d1e15fa8bf6540e7c8e1 -->

```text
ALLOW: docs/briefs/15-gcp-team-trigger.md
ALLOW: scripts/demo/trigger-alert.mjs
ALLOW: scripts/demo/trigger-watchdog.mjs
ALLOW: scripts/demo/cloud-trigger.mjs
ALLOW: scripts/demo/cloud-runtime.mjs
ALLOW: scripts/demo/cloud-monitors.mjs
ALLOW: deploy/bootstrap.sh
ALLOW: deploy/deskdrop-operator
ALLOW: deploy/systemd/deskdrop-trigger.service
ALLOW: deploy/systemd/deskdrop-trigger-recovery.service
ALLOW: tests/demo-trigger.test.mjs
ALLOW: tests/cloud-trigger.test.mjs
ALLOW: tests/cloud-operator.test.mjs
ALLOW: docs/demo/gcp-team-handoff.md
ALLOW: docs/demo/incident-walkthrough.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
ALLOW: scripts/demo/baseline.mjs
ALLOW: tests/demo-baseline.test.mjs
ALLOW: docs/demo/gcp-trigger-evidence.md
ALLOW: docs/demo/gcp-costs.md
ALLOW: docs/demo/screenshots/gcp-trigger-status.png
ALLOW: docs/demo/screenshots/gcp-trigger-recovery.png
ALLOW: docs/demo/screenshots/gcp-native-actions.png
```

<!-- /coderabbit-ai-generated:v1 -->

No shopper code/behavior, npm manifests/locks/dependencies, goldens, provider locks/pins, host packages/pins, new runtime images or unrelated workflows. Report exact necessary cloud-only amendments before editing for delegated review. Three screenshot paths are reserved for actual authorized observed evidence only; do not create placeholders, relabel sandbox as cloud, or fabricate images. Missing live screenshots remain explicitly pending and do not justify provider writes in the task.

## Observable validation and required gates

Test kernel peer identity vs spoofed request/environment, extra arguments/injection, wrong mapping and denied actor before mutations. Use real competing disposable clients/processes to prove one admission, client disconnect survival, kill/restart recovery, no orphan/overlap and unrelated-process preservation. Cover simulated boot changes/clock rollback, stale/corrupt/wrong-owner/link/mode journals, bounded hung/partial provider operations, pagination ambiguity, unknown writes, exact-owned resources and failed suppression with independent app restart. Do not manufacture RED using absent imports; preserve existing assertions and meaningful behavior regressions.

Run focused new/affected Node tests, full npm test, typecheck, unchanged goldens, affected Playwright checkout/persistence and Terraform fmt/validate/mock checks in sanitized environments. Actual Linux peer-credential/systemd/Docker/reboot/isolation/private access and real US3 intake remain separately observed live gates. Sandbox/process tests cannot satisfy them.

Exactly one COMPLETED CodeRabbit CLI REVIEW for this new task before PR publication. Keep Autofix and Run CLI review OFF; Mac harness performs the single review only after the whole diff is complete. No CLI authoring login prerequisite. PR fixes exempt; no additional legacy judges. Commit/push completed implementation; report full source/base, exact changed files, tests and every finding disposition; WAIT for Mac CLI receipt before PR creation. PR description first line Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/27. Require exact-head CodeRabbit PR/security/CI, zero unresolved findings and conclusive native QA Verify before delegated merge.

## Documentation and live handoff

Update setup/process/Do–Say–See guides with exact verified commands, private access/enrollment, healthy $97 baseline, trigger/fresh incident, independent Jira or Debug paths, recovery/status, stop/rollback, cost/retention and all blockers. Follow the standard Do–Say–See methodology already used by the demo runbook, with real high-resolution source/event/receipt screenshot provenance. Publish no video. Root will refresh the existing Work Drive PDFs after observed verification; do not upload or send messages from the coding task.

Live package limits remain at most three cloud Alert/recovery cycles, at most one synthetic incident Bug and one isolated unmerged fix PR total, no new shopper fixture authoring or faulty fixture deployment. No cloud/browser/native provider action is authorized inside this coding task. Mahesh-only pilot is distinct from team/denied-presenter acceptance; document deferred group/tester and missing existing authority honestly. Stop new fault admissions by November6, 7AM Pacific and prioritize recovery/effective suppression.

## Preliminary interface integration (2026-11-06)

Published monitoring snapshot `ae0e7cd7724d4b500ab4906a4bd3d5cd65385912` is integrated under the delegated checkpoint. Final merged foundation/monitoring parents are still required before final review/publication. Stage 14 keeps its single broad owner-selector protection and unchanged install API/defaults. The trigger journal persists exact-monitor protections, confirms all three effective matches before canceling broad protection, then opens only checkout. Recovery restores broad protection before retiring temporary protections and updating the stage 14 protection receipt. Unknown writes preserve intent and close admission.

Within the existing allowed cloud monitor file, the trigger adapter adds only GET notification-rule inventory/detail and GET monitor group-state reads, using documented Datadog v2 notification-rule pagination and v1 monitor reads. No monitor updates or notification-rule mutations are added. A separately configured, explicitly enrolled cloud rule/recipient must already exist; complete stable inventory must prove exact owner coverage and Alert-only delivery. Unsupported filters or ambiguous coverage block admission. The install-focused makeCloudApi whitelist remains unchanged. No additional path, package, runtime pin or provider permission is requested.


<!-- /coderabbit-ai-generated:v1 -->