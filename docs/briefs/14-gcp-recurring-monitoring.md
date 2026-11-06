# Brief 14: feat: GCP recurring monitoring and separate cloud installation

GitHub engineering acceptance: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/26
Parent live rollout: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/24
CodeRabbit normal task: https://app.coderabbit.ai/code/tasks/5f11c295-7205-4243-9c6d-c7f95fa46150

## Delegated authorization and dependency

Mahesh approved the bounded GCP package, routine maintainer delegation, Mahesh-only pilot and $100 first-seven-days Google Cloud allowance on November5. Coding-agent time/cost is uncapped. Use only existing work-account permissions; document extra admin requirements. Native implementation performs no live GCP/Datadog/Slack/Jira action. Cloud acceptance is separate from offline tests and native Verify. Videos are not required; capture actual screenshots.

Codex reviewed the plan-only response and approves its trusted pinned-image controller, independent heartbeat,25-second journey deadline,3-second termination grace, fail-closed cleanup/reconciliation and metadata denial design. The18th path baseline.mjs is approved only to extend source-bound host installation/verification/receipts for this monitoring bundle. This procedural approval uses the existing delegation; no npm/host-package/provider/runtime pin change is added.

Parallel authoring amendment: start independent monitoring work in this isolated task from the published foundation snapshot below. Defer overlapping baseline installer integration and final validation until issue25 has a reviewed final source; then merge that source without overwriting either task. Report full source/base; do not invent receipt fields. Do not open a main-targeting PR until foundation has merged and the monitoring-only diff is below30 paths. The observed4c3b11bc2660f92a770ac0eb210116191d6e3f69 revision contains the19-path foundation diff and verified Docker/BuildKit pins, but its review/gates are pending. This brief does not label it merged or permit skipping those gates. Foundation-only receipts never authorize monitoring installation.

## Verified assumptions

- Main includes PR22 as0f0c42fcff214a8b8fbfd5ee5813d79d351dd94c; fixturePR23 remains unmerged, paused custom bridge remains paused.
- Existing Ubuntu24.04 amd64 bootstrap installs Python3/systemd/Docker and not host Node. Do not add a host Node package, extraction installer or assume a host binary.
- Reuse node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607 as a DISTINCT trusted control container. It uses Node standard-library HTTP over the Unix Docker socket; do not assume Docker CLI exists inside it. Root Python/bootstrap and systemd supervise it. No new dependency.
- Existing bootstrap protects release/source/images, intake refresh, firewall/seccomp and loopback forwarding. Current host-install evidence binds bootstrap/Compose only; extend it explicitly to hashes of every installed monitoring module/unit, never invent pre-existing evidence.
- User/ADC work, billing and observed quota suffice for one target VM. Existing direct project Editor does not supply tested IAM policy writes/IAP access. No live DeskDrop resource/API/IAM/secret writes have occurred. Resource-level authority and live worker/publication/telemetry remain unverified.
- Three local monitor IDs29524290/29524154/29524292 and local selectors/defaults/routing/suppression are preserved.
- Engineering Jira Task create returned403. Do not retry unchanged, use another provider to bypass it or fabricate an SC key. GH26 is the delegated engineering acceptance record; PR creation may use gh with first line Fixes plus raw GH26 URL. This exception does not satisfy the independent incident-Jira path.

## Required observable behavior

1. Run availability and the existing fresh-storage sandboxed synthetic checkout every30seconds. Preserve100-15+12=97 at checkout, receipt and history, including both item identities/colors/quantities. Each journey uses a fresh browser context/disposable checker container. No shopper changes.
2. No overlap or catch-up storms. Enforce25s journey deadline,3s graceful termination then bounded forced removal; confirm the exact owned child is stopped before replacement. Ambiguous stop blocks replacement and exposes degraded controller health. Actual process/container cleanup tests must preserve unrelated processes.
3. Heartbeat runs independently of browser execution and cannot report a healthy controller when scheduling/cleanup has failed. Separate process/container lifecycle ensures hung checkout cannot block it. UDP/submission success is not provider intake proof; telemetry failures remain truthful and later live readback is required.
4. App/checker remain non-root, sandboxed, secret-free and Docker-socket-free. Preserve host/metadata/IPv4/IPv6/egress denial. Trusted controller is outside app/checker networks, gets only fixed validated Docker operations and root-owned source configuration. Root Docker is an administrative boundary; never expose it through a presenter request. Recurring runtime gets no Datadog management key. Intake key goes only to the trusted Agent. A separate root installer uses the protected management secret for lifecycle operations.
5. Add host-originated metadata denial for non-root actors independently of bridge rules, covering actual metadata addresses/aliases and IPv4/IPv6 where applicable. Presenters must lack Docker membership/unrestricted sudo. Mahesh admin access is not evidence of denied-presenter acceptance; require a later actual non-admin actor test. Preserve root/controller bootstrap access and documented private app access.
6. Durable root-owned /var/lib/deskdrop/monitoring directories0700/files0600; validate every parent, canonical path, ownership, file/link type and schema. Persist intent before provider writes; fsync and atomic replacement, locks/leases and ownership tags survive restart/reboot. Reject corrupt/unowned/ambiguous records. Unknown create/delete, incomplete/changing pagination or multiple ownership matches reconcile without duplicate writes and retain evidence.
7. NEW cloud-only installation, service checks deskdrop.cloud.*, US3, exact tags service:deskdrop env:gcp-demo demo_id:mmani-shopping-cart-gcp host:deskdrop-demo managed_by:deskdrop-gcp-controller plus cloud_owner:<protected random value>. Include owner in selection and telemetry. Persist real IDs; never reuse local IDs or mutate local defaults. Keep cloud notification suppression effective until separate approved routing/activation acceptance. Deletion only for the exact owned cloud installation, preserving local/shared resources.
8. Bind installation and recurring runtime to verified real foundation/release source/image/plan/host-bundle receipts. Reject wrong project/region/zone/registry/architecture/commit/image/container/owner before mutation. Source-bound transfer covers every module/unit; all imports must exist on the VM. No dependency on the Mac or personal browser for recurring operation/recovery.
9. New management secret resource is separate from intake; no secret values in Terraform/source/metadata/images/logs/arguments or app/checker. Preserve existing private networking, OSLogin/IAP, provider locks/resource addresses and shared APIs. No broad or default privileged runtime identity. Live authority stays documented when unavailable.
10. Local defaults, all existing assertions/goldens, shopper behavior and the six cart rules remain intact. Native Jira and Debug/PR are independent user actions. Debug inspects repo/application directly without Jira references or prerequisites.

## Exact scope (18 paths)
```text
ALLOW: docs/briefs/14-gcp-recurring-monitoring.md
ALLOW: deploy/bootstrap.sh
ALLOW: deploy/compose.yaml
ALLOW: deploy/checker.Dockerfile
ALLOW: deploy/cloud-checker.mjs
ALLOW: deploy/datadog/cloud-monitors.json
ALLOW: deploy/systemd/deskdrop-monitoring.service
ALLOW: scripts/demo/cloud-runtime.mjs
ALLOW: scripts/demo/cloud-monitors.mjs
ALLOW: scripts/demo/datadog-monitors.mjs
ALLOW: infra/terraform/cloud-monitoring.tf
ALLOW: infra/terraform/tests/cloud-monitoring.tftest.hcl
ALLOW: tests/cloud-monitoring.test.mjs
ALLOW: tests/cloud-monitors.test.mjs
ALLOW: tests/local-datadog-monitors.test.mjs
ALLOW: tests/demo-baseline.test.mjs
ALLOW: docs/demo/gcp-team-handoff.md
ALLOW: scripts/demo/baseline.mjs
```

No npm/manifests/locks/goldens/provider locks/host-package pins/shopper code/unrelated workflows. Entire feature PR<30paths. Report necessary exact cloud-only amendments before editing for delegated review.

## Validation and gates

Add observable tests for30s cadence, fresh journey/storage, no overlap, independently ticking heartbeat under hung checkout, bounded TERM/KILL/cleanup, unknown outcomes, stale controller health and failed intake. Exercise real disposable processes; mock provider/Docker transports must assert exact operation/identity and absence of forbidden calls, not merely imports. Cover unsafe directory/file/link modes, corruption, concurrency/crash windows, restart/reboot reconciliation, pagination ambiguity, wrong identity and preservation of all local state/selectors. Meaningful RED/GREEN for existing behavior changes; do not manufacture RED through missing-module imports.

Focused new/affected tests, complete npm test, typecheck, unchanged golden checks, affected Playwright checkout/persistence suites, Terraform fmt/validate/mock tests in sanitized environments are required. Preserve every existing test/assertion. Actual Ubuntu pinned-image/Node/socket/systemd/sandbox/restart/reboot/private-access proof and fresh US3 intake remain live gates; sandbox evidence cannot stand in for them.

Exactly one COMPLETED CodeRabbit CLI REVIEW for this new task before PR publication. Autofix OFF; Run CLI review OFF. Mac harness supplies the single review on completed diff; do not run another inside the task. PR-fix rounds exempt. Use CodeRabbit PR feedback only; no legacy four judges. Commit/push implementation, report full commit/base/exact files/test/finding receipts and WAIT for Mac CLI receipt before PR creation. PR body first line Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/26. Require exact-head CodeRabbit PR/security/CI, zero unresolved findings and conclusive native QA Verify before delegated merge. No cloud deployment/provider writes in this coding task.
