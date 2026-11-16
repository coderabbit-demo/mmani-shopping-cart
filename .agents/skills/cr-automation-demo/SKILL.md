---
name: cr-automation-demo
description: Prepare or resume the retained DeskDrop incident demo on macOS Docker Desktop before a human trigger.
---
<!-- coderabbit-ai-generated:v1 -->


# CR Automation Demo

Leave the presenter ready to trigger the existing local Docker incident workflow. Preparation ends with an evidence-backed READY or a precise BLOCKED handoff and no open-ended agent work. Keep the intentional demo runtime running in the presenter's Terminal.

## Workflow

1. Read [runtime.md](references/runtime.md) to identify the actual runtime checkout, verify prerequisites and receipts, and choose the running, cleanly stopped, or interrupted path. The skill checkout and immutable runtime checkout may differ.
2. Read [integrations.md](references/integrations.md) to discover maintained private configuration and verify existing enrollment, effective routing, native actions and fixture source. Missing access or unresolved drift blocks readiness.
3. Reuse a verified controller or start the official controller only from a cleanly stopped installation in a durable presenter-owned Terminal. A pending start journal is normal only while its verified controller owns it; orphaned or unknown state is BLOCKED.
4. Collect fresh evidence within the documented bounds. Healthy containers or startup stdout alone are insufficient.
5. Hand off the exact next presenter action without executing it.

## Authorization

Preparation can start the retained runtime and its normal telemetry/checks. It does not authorize an alert, app-stop fault, notification test, Jira write, coding task, fix PR or merge. Never send Slack operator messages during preparation or in the incident thread. Leave the final trigger unexecuted until explicitly authorized. Do not repair account permissions, routes, enrollment or security settings without concrete reviewed authorization.

Preserve existing repository access and do not enable Autofix during preparation. Native CodeRabbit authoring has no CLI login, review or receipt prerequisite. Do not add dependencies, helper scripts, services, host npm installs or cloud deployment steps. Never modify a running/pinned checkout or force-reset user work.

## Readiness and handoff

Report READY only when all are current and mutually consistent:

- Local status: availability=0 and checkout=0 with timestamps no older than 60 seconds, telemetry sent, journeyBlocked=false and controlBusy=false; local check succeeds.
- Verified live controller/session and operation ownership; expected four persistent owned services and bound source/image identities.
- All three exact owned Datadog monitors OK and suppressed, and trigger plan status ready with blockers empty, including full effective rule inventory and Alert-only proof.
- Maintained private configuration and live integration/fixture checks verified; no unresolved trigger, monitor or journey state. A verified controller-owned pending start is the sole normal pending operation.

Final response: READY or BLOCKED, observation timestamp, runtime source and http://localhost:3177/, controller lifetime/session, integration results, and exact next action labeled REAL or TEST. On BLOCKED, name the failed gate and next concrete read-only diagnostic; do not trigger or keep retrying. Historical action evidence is historical, not a newly passed rehearsal. Hosted browser QA cannot reach or validate this Mac runtime.

Default presenter action, from the verified runtime root, is REAL: `bash scripts/demo/trigger-alert.sh run --execute`. Provide plan/status, explicit recovery and shutdown commands from the references. Do not execute run or recover as setup.
