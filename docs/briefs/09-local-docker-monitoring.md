# Brief 09 — local Docker monitoring and controlled demo

**Status:** Approved by Mahesh on 2026-11-04. Approval covers the 15-path brief at `53b25cf`, CodeRabbit task 0366976d's original and corrected author plans, and continuation of implementation in that same task. It includes local Docker validation and explicit notification-free creation/readback of the three owned US3 monitors after offline validation. Live notification/automation activation, incident rehearsal, GCP work and merge remain separate approvals. No new dependency, provider, runtime or image-version change is authorized.

**Parent:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
**GitHub child:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/15
**Jira:** [SC-37](https://coderabbit-demo.atlassian.net/browse/SC-37); retain historical SC-35/SC-36 completion.
**Base:** merged main `f7a859dfe151a78a71dc8d6e3c5d87385eb6c8e1`.
**Branch:** `codex/local-docker-monitoring`.

## Outcome and boundaries

Keep DeskDrop, its browser checks and its Datadog Agent on Mahesh's Mac using Docker Desktop. Use real Datadog US3 telemetry and monitors so a later controlled native CodeRabbit/Slack/Jira/PR rehearsal can be performed without GCP. The hosted SaaS integrations remain external services; local-only describes the application runtime and operator controls. Defer all GCP apply, IAM/state/Secret Manager changes, registry publication, VM installation and deployment. Preserve the accepted GCP configuration and every application rule/test/golden.

This PR supplies a local runtime/controller, recurring monitoring, exact scoped Datadog monitor definitions and explicit monitor lifecycle commands. It prepares the existing MMANI automation's local scope record and operator steps. Live notification/automation activation, a synthetic incident, button selections, fault seeding, remediation tasks/PRs and merges are subsequent, explicitly controlled rehearsal actions. Initial monitor creation must be notification-free or demonstrably muted; missing spend/window inputs block activation, not implementation or offline tests.

CodeRabbit Code authors all implementation and corrections. The Mac orchestrates and validates. Use CodeRabbit CLI and exact-head PR/security feedback only; Mahesh selected CodeRabbit-only feedback instead of the four model judges. Require exactly one completed CLI review for this new coding task before completion/PR publication, with the task/base/head/outcome and every finding disposition recorded. A completed in-task run counts; use the Mac only as fallback. Existing-PR fixes are exempt. Use CodeRabbit QA Agent Verify for the exact implemented revision. Do not interpret its sandbox as access to Mac localhost.

## Assumptions verified 2026-11-04 America/Los_Angeles

- PR 14 is merged at the base above; this is a new local phase, not a reopening of the GCP task. The Git worktree was clean before this draft. No DeskDrop containers were running during the read-only local check.
- Installed Node is 24.13.0, CodeRabbit CLI is 0.9.2, its normal `code new --agent -` and `code resume --agent -m -` interfaces are available, and CodeRabbit authentication selects `coderabbit-demo`. Start a normal task with a plan-only instruction; do not use `--plan` because the same task must continue into implementation after approval. Autofix remains off.
- Existing `deploy/compose.yaml` already pins Agent 7.85.0 for US3 and uses a secret-backend file reference. It is designed for the Ubuntu VM, so do not run its host bootstrap on macOS. Existing app/Playwright/Agent immutable pins and linux/amd64 architecture in `deploy/runtime-versions.json` remain approved; no runtime, image or npm dependency change is requested.
- Existing `deploy/checker.mjs` is one-shot and validates a fixed private Compose URL and GCP registry identity. It verifies the $97 checkout, receipt and both order-history items. Reuse this behavior without inventing registry publication evidence for local images or weakening GCP target validation.
- `.env.demo.local` was created as an ignored local file with mode 0600. `.gitignore` and `.dockerignore` already exclude `.env*`. Unlike `.env.local`, this name is not automatically loaded by Next.js. The user has authorized using this file for the local demo. Never print, commit, upload, archive or send its values to CodeRabbit.
- Loading the file with Node's existing `--env-file` facility validates both keys through `https://api.us3.datadoghq.com/api/v2/validate_keys` (HTTP 200, accepted) and reads DeskDrop monitors (HTTP 200, zero named DeskDrop). Application-key write/downtime rights and actual Agent intake are not yet proven. A separate Terminal's exports did not reach the existing Codex process. Explicitly handle blank/conflicting inherited environment variables rather than silently selecting a different credential.
- The three exact local service-check candidate bodies returned HTTP 200 from the non-persisting US3 monitor validation endpoint using `.over(...).by("host").last(2).count_by_status()`. The `.last(2).by("host")` ordering shown in API prose returned HTTP 400 for these same bodies. Preserve the observed accepted form and test against the rejected form. Heartbeat's two-minute no-data configuration also validated. Validation is not ingestion, actual creation authorization or draft-feature proof. The v2 downtime read probe returned HTTP 200; actual writes remain unproven. The env file is a regular, current-user-owned, non-symlink mode-0600 file.
- The native CodeRabbit QA environment `mmani-ecommerce` has a prepared setup revision 6. Its sandbox checkout journey passed on main `f7a859df`; this is application-sandbox proof, not local Docker telemetry, hosted workflow or GCP acceptance.
- Native automation `Datadog to Slack Automation - MMANI` already exists. Reuse it; its historical destination/instructions are not proof of current alignment. Required destination remains CodeRabbit Demo workspace `T0AU433PG75`, channel `C0CEPB2LURY` (`#mmani-shopping-cart`). Read its current state before any separately authorized update.

## Local runtime and credential boundary

Use a separate fixed Compose project `deskdrop-mmani-local` with non-colliding, validated local resources. Keep the GCP Compose and harness unchanged. Expose the app only on a selected, fixed Mac loopback port; fail if it is occupied and never stop an unrelated listener/container. App and browser-checker containers have no Datadog API/application key, Docker socket or cloud credentials. Preserve non-root execution, sandboxed Chromium, dropped capabilities, no-new-privileges, bounded resources, appropriate writable temporary storage, health checks and log rotation. Reuse the reviewed seccomp generator and exact existing policy digest; no disabled browser sandbox, SYS_ADMIN or unconfined policy.

The concrete author plan selects `127.0.0.1:3177`, fixed host identity `deskdrop-mmani-local`, private UDP DogStatsD, a five-second HTTP deadline, and a 25-second browser deadline with bounded termination. Maintain independent monotonic 30-second schedules without catch-up bursts, skip an overlapping journey and report degraded/failure status while preserving availability/heartbeat. Validate healthy timings on the Mac; do not weaken assertions to fit a deadline.

The local controller must have read-only help/status/preflight paths and explicit build/start/stop/check plus owned app/checker stop/restart controls. No gcloud, Terraform, registry push, VM command or implicit service login may run. Build from clean committed source without `.env*` or generated artifacts; record exact commit, architecture and local image IDs before starting. Verify the running app image identity and source label independently. Local image IDs are local evidence, not a registry pull or GCP digest receipt. Local and GCP identity validation must remain explicit and separate.

Credentials enter only through `DD_API_KEY`, `DD_APP_KEY` (or the existing compatible `DD_APPLICATION_KEY` alias) and fixed `DD_SITE=us3.datadoghq.com`. Reject mismatched nonempty aliases and wrong sites. Use built-in Node functionality; do not add dotenv or another dependency. Document exact safe invocation using `.env.demo.local`, without displaying credentials. Strip credential variables before child processes; do not place secret bytes in subprocess arguments, Compose environment/config, image layers, logs, receipts, diagnostics or telemetry. No NEXT_PUBLIC credential variables.

Provision the Agent intake key through an explicit protected local runtime file/directory and the pinned Agent's supported secret backend. The Agent alone receives the intake file; the application key remains in the Mac monitor-management process. Fail closed for missing/invalid files, symlinks, unsafe ownership/mode, unsafe targets and missing tools. Do not read other credential stores, browser data or clipboard. Limit cleanup to exactly owned runtime artifacts and document retained material. Validate actual Docker Desktop secret-backend compatibility; do not assume the VM's `/proc`, cgroup or `/run` mounts are macOS host paths.

The Agent is trusted infrastructure: Docker socket access is effectively daemon control even with a read-only mount. Restrict selected per-container metrics/logs to this local project, disable unnecessary APM/process/security collectors, and exclude unrelated container logs. Document and validate any unavoidable host/aggregate telemetry; container discovery filters do not suppress every aggregate Docker count and are not an API authorization boundary. Do not claim GCP Linux firewall isolation from Mac Docker evidence. No public Agent, DogStatsD or admin port is permitted.

## Recurring checks and telemetry

Use fixed low-cardinality identity tags `service:deskdrop`, `env:local-demo`, `demo_id:mmani-shopping-cart-local` and a fixed local host identity. These are the only monitored runtime scope for this phase. Record source commit/image identity in sanitized diagnostic events, not high-cardinality monitor grouping.

Run independent bounded HTTP availability and browser-journey checks every 30 seconds, with no overlapping journey executions. Keep runner heartbeat independent of app success. Handle full-journey deadline, browser startup failure, hung child, network failure, interruption and cleanup deterministically. A stalled browser must not silently keep reporting a healthy journey or prevent availability/heartbeat observations. Define and test the scheduling/overrun policy.

Every browser run uses fresh storage and synthetic shopper data. Verify two chosen colors, $68 lamp + $32 organizer, $100 subtotal, DESK15 $15 discount, express $12, final $97, receipt and every history item. Preserve all existing assertions. Report OK/CRITICAL service checks and liveness through a private DogStatsD path; configure the Agent receiver explicitly and prove delivery. A UDP send alone is not proof of Datadog ingestion. Selective structured diagnostics include failure class/stage and allowlisted expected/actual observations without page bodies, entered fields, localStorage or arbitrary browser/command error text. Bound and redact outputs.

## Scoped monitors and operator control

Prepare exactly three named monitor resources, with the three identity tags above plus an explicit ownership marker. Queries must require all scope tags and avoid global/all-host scopes:

1. **[MMANI local] DeskDrop availability**: independent HTTP service check, alert after two consecutive failures and recover after two consecutive successes.
2. **[MMANI local] DeskDrop checkout**: $97 browser journey service check, same failure/recovery thresholds.
3. **[MMANI local] DeskDrop checker heartbeat**: separate runner liveness, notify on missing data after two minutes. Establish initial healthy ingestion before claiming missing-data coverage; an unseen group is not an alert proof.

Validate exact schema, service-check grouping, query grammar and no-data semantics against the live US3 validation endpoint and subsequent observed transitions. An account policy or unsupported option must remain a visible blocker; do not silently change two-minute/two-result acceptance.

Use checks `deskdrop.local.availability`, `deskdrop.local.checkout`, `deskdrop.local.heartbeat`. Queries require the three fixed identity tags and `host:deskdrop-mmani-local`, group by `host`, and use the observed accepted `.by("host").last(2).count_by_status()` order with `type: "service check"`, critical 2 and OK 2. All monitor resources also carry `managed_by:deskdrop-local-controller` and one unique installation ownership tag.

Use Node built-in HTTPS and fixed US3 API endpoints instead of adding a Datadog Terraform provider or SDK. Supply reviewable offline definitions and a non-mutating plan/diff. All real API operations are explicit: inspect/validate, apply notification-free monitor definitions, enable/disable owned notifications and status. Protect updates with an allowlist of exact owned IDs and fetched matching names/tags/query ownership; never adopt/delete/mute unrelated monitors, use force flags or mass-mute an organization. Fail on ambiguous duplicates, stale plans, changed ownership, redirects, permissions, API errors, partial writes and timeouts. Record sanitized per-resource outcomes and inspect actual state before retrying an unknown outcome. Reapplying must not duplicate monitors.

An empty message alone is not notification suppression: organization notification rules may add recipients. Do not require the preview draft-monitor feature. The author's stable initial-creation design is a narrowly scoped v2 downtime, created explicitly before monitors: generate one 128-bit installation tag; paginate visible monitor inventory and establish zero matches for that tag AND the controller ownership tag AND all three fixed demo tags. Require complete visibility and a protected local lock/journal. Read back the exact active selector before proceeding. Its group `scope: "*"` covers only groups of monitors matching all five monitor tags, never all monitors. Datadog documents AND matching and inclusion of subsequently created matching monitors. Do not permit a wildcard monitor selector or a weaker selector.

Create each monitor with that exact selector, journal and verify its returned ID and active downtime match, then establish/read back a separate downtime for each exact owned ID. Remove only the installation's initial tag-selected downtime after all three ID-specific downtimes are confirmed. Keep those ID-specific downtimes through setup/shutdown until explicit notification enablement. Disable downtime end notifications and mute first recovery as supported; never cancel unrelated downtimes or auto-expire the protection. Recheck selector/IDs/hashes before each mutation. A concurrent ownership change, unsupported suppression, missing permission, unknown create result or uncertain readback stops reconciliation, retaining confirmed protection and a visible outcome. Validation/readback is not proof that no propagation window exists; live suppression behavior remains an operational check before activation. Required permissions are `monitors_read`, `monitors_write` and `monitors_downtime`, with any actual account-level monitor editing/muting restrictions verified separately. Do not automatically grant them.

Separate monitoring from incident automation: ordinary healthy startup and stopping containers must not unexpectedly launch CodeRabbit work. Keep notification activation explicit, require a confirmed monitoring/rehearsal window and usage owner/limit, and suppress only owned monitor notifications before intentional full shutdown. If suppression fails, report it and avoid silently treating teardown as clean. App/checker failure demonstration controls intentionally leave monitoring active. Re-arm only after fresh healthy data. Document that macOS sleep, Docker shutdown and network loss stop local telemetry; this runtime is not always-on.

Do not put the authenticated CodeRabbit webhook URL/header in JSON, Git, logs or state. A reviewed non-secret webhook name can be configured by the operator later; authenticated provider setup remains outside committed files. Do not send a synthetic alert or change the existing live MMANI automation while implementing or validating notification-free monitors.

## Native workflow preparation and later proof

Update operator documentation with the exact proposed local tags/failure classes, expected Datadog payload fields and matching filters, approved channel, button-gated triage and the source/image evidence contract. Mark actual provider payload mappings and filter enforcement pending until verified; an instruction to ignore events does not enforce a trigger boundary.

Preserve the two independent buttons, Jira SC Bug reuse, task/PR reuse, incident episode identity, both button orders, replay/concurrent-click tests and visible failure reporting in the existing automation runbook. Never claim prompt-only searches serialize concurrent actions. If native behavior cannot meet reuse criteria, stop further rehearsal and report the gap rather than add unapproved infrastructure. Fault seeds and fixes stay on isolated demo branches and target the faulty branch; no bug injection in this healthy-baseline PR.

QA Agent tests the exact PR revision in its prepared environment. Separately validate the actual Mac Docker app through the local checker and the rebuilt fixed image during the later rehearsal. Neither a QA sandbox pass nor local fixtures establish hosted alert/button/ticket/task/PR delivery. Retain all GCP-specific live acceptance as deferred.

## Tests and acceptance

- Add `node --test` behavioral coverage for every new scheduling, lifecycle, credential, identity, telemetry, monitor ownership/API and failure behavior. Use controlled clocks/process/network/API adapters without arbitrary host changes or live services in unit tests. Preserve existing tests/assertions; do not edit goldens.
- Cover missing/empty/conflicting keys, wrong site/endpoint/target, redaction, no secret propagation, image mismatch, dirty source, occupied port, stale plan, duplicate monitors, unauthorized ownership, partial failure, unknown timeout outcome, no mutations on help/status/plan, stop/restart cleanup and interruption. A validation request may contact Datadog but must not persist a monitor.
- Cover zero-match inventory and complete pagination, exact AND selectors, pre-established suppression, exact-ID downtime handoff, unexpected ownership changes, downtime failures, unknown create/cancel outcomes and retention of confirmed protection. Assert the accepted query form and rejection of the observed invalid order for all three definitions.
- Cover healthy and failing app/journey, fresh browser contexts, independent heartbeat, no overlap/deadline, two-result transitions and missing checker data. Verify outbound service-check bytes and sanitization; retain separate actual Agent/Datadog evidence.
- Run npm ci, typecheck, full units, 29 unchanged goldens, production build and the 86-test Playwright suite as applicable. Reuse unchanged expensive evidence only with explicit exact-source rationale. Run required local amd64 build, resolved Compose inspection, actual sandboxed checkout, owned-container lifecycle checks and an unrelated disposable canary demonstrating collection filters. Never collect canary customer/credential data.
- Actual Agent intake and live US3 monitor validation/readback require authorized local credentials. Notification-free monitor application is a distinct operator command after implementation approval and offline validation; retain IDs, queries, tags and status evidence. No live alert/automation rehearsal before its explicit activation gate and scope review.
- This phase completes when the local healthy stack, recurring telemetry and three strictly scoped, operator-controllable monitors are verified; exact-head CodeRabbit PR/security/CI and conclusive relevant QA Agent results are retained. Unavailable live evidence stays pending and is not a pass. No new npm/provider/image/runtime dependency, product behavior change or cloud deployment is part of completion.

## Approved file scope (15 paths)

```text
ALLOW: docs/briefs/09-local-docker-monitoring.md
ALLOW: deploy/compose.local.yaml
ALLOW: deploy/local-checker.Dockerfile
ALLOW: deploy/local-checker.mjs
ALLOW: deploy/checker.mjs
ALLOW: deploy/datadog/local-monitors.json
ALLOW: scripts/demo/local.mjs
ALLOW: scripts/demo/datadog-monitors.mjs
ALLOW: tests/local-demo.test.mjs
ALLOW: tests/local-monitoring.test.mjs
ALLOW: tests/local-datadog-monitors.test.mjs
ALLOW: tests/deployed-checker.test.mjs
ALLOW: docs/demo/local-docker.md
ALLOW: docs/demo/runbook.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
```

No dependency change is proposed. Do not change package.json, package-lock.json, existing runtime/image pins, existing GCP Compose/bootstrap/harness/Terraform, application code, CI, goldens or global framework policy. If the author plan needs another path, dependency, runtime permission or paid service, propose the exact amendment before implementation.

## Primary references checked

- Docker Agent and Compose support: https://docs.datadoghq.com/containers/docker/ and https://docs.datadoghq.com/containers/guide/compose-and-the-datadog-agent/
- Docker Desktop log configuration and selective collection: https://docs.datadoghq.com/containers/docker/log/ and https://docs.datadoghq.com/containers/guide/container-discovery-management/
- DogStatsD service-check protocol/monitoring: https://docs.datadoghq.com/extend/service_checks/dogstatsd_service_checks_submission/ and https://docs.datadoghq.com/extend/dogstatsd/datagram_shell/
- Consecutive service-check thresholds and initial no-data prerequisite: https://docs.datadoghq.com/monitors/types/service_check/ and https://docs.datadoghq.com/monitors/configuration/
- Monitor API and permissions: https://docs.datadoghq.com/api/latest/monitors/create-a-monitor/ and https://docs.datadoghq.com/account_management/rbac/permissions/
- Native webhooks/buttons/deduplication: https://docs.datadoghq.com/integrations/webhooks/ and https://docs.coderabbit.ai/slack-agent/automations
- Suppression and notification-rule behavior: https://docs.datadoghq.com/api/latest/downtimes/schedule-a-downtime/ , https://docs.datadoghq.com/monitors/downtimes/ and https://docs.datadoghq.com/monitors/notify/notification_rules/

## Plan and delivery checkpoint

The plan-only checkpoint is complete and Mahesh approved the brief and concrete author plan. Continue implementation in the same normal task. Keep Autofix off and preserve all boundaries above.

CodeRabbit task [0366976d-e1c9-40a3-bfdd-dd2ac3b61e8a](https://app.coderabbit.ai/code/tasks/0366976d-e1c9-40a3-bfdd-dd2ac3b61e8a) completed its original plan and corrected plan-only turn with no file changes. It confirmed the 15 paths suffice and clarified exact local transport/timing/identity, accepted query shape and pre-established suppression without relying on draft preview. Mahesh approved these choices in this chat on 2026-11-04. Exactly zero CLI reviews are completed for this task so far; require its single completed review during implementation, with Mac fallback only if no in-task review completes.

After implementation and applicable checks, open a PR with first line `Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/15` and `Jira: SC-37`, preserving all strict gates. Request native QA Agent Verify, record exact tested source/results, and report live local telemetry/monitor evidence separately. No merge is authorized by this brief.
