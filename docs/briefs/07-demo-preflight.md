# Brief 07 — `chore: demo preflight and incident handoff`

**Mode:** Brownfield, operational tooling and documentation. **Jira:** SC-35
**GitHub:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
**Status:** Draft for maintainer approval. CodeRabbit must propose a plan first and make no implementation changes until the maintainer approves this brief and the plan.

Read `AGENTS.md`, `docs/PLAN.md`, this brief, and the linked GitHub/Jira acceptance criteria. Preserve all existing product behavior, tests, assertions and goldens. CodeRabbit Code is the implementation author; the Mac runs orchestration and verification.

## Goal

Make the Mac a repeatable harness for the incident demo before provisioning GCP. Deliver a tested, read-only preflight command and a runbook for the existing native Datadog-to-Slack automation. Prepare the repository's PR helper to link this GitHub issue while preserving legacy brief behavior.

This PR does not provision infrastructure, build/publish container images, seed faults, change the app, configure service permissions, change the live automation, send Slack messages or dispatch an incident/coding task. Live automation changes and the disposable end-to-end rehearsal are separate operator actions after the brief and implementation are accepted.

## Assumptions and targets (verified 2026-11-03)

- Baseline `main` is `30417fe1237a386af5cfbe6043b4b0e87576190d`. The checkout was clean and detached before this brief; CodeRabbit requires a named pushed branch. Use `codex/demo-preflight` for this phase.
- Repository: `coderabbit-demo/mmani-shopping-cart`; GitHub user `manimahesh` has ADMIN access and Issues is enabled.
- GCP project: `se-demos-project`, active with billing enabled. CLI authentication and ADC token refresh pass. Granular provisioning/IAP/state permissions and ADC quota-project alignment remain separate preflight requirements.
- Datadog site: **US3**, `us3.datadoghq.com`, API base `https://api.us3.datadoghq.com`. The US3 browser session is signed in. CodeRabbit's saved Datadog connection shows Connected, uses US3, and is assigned to Slack Default and `mmani-shopping-cart`.
- Mac-side Datadog API/application credentials were unavailable at the last check. A connected CodeRabbit/browser session does not make credentials available to this CLI. Never retrieve credentials from browser pages, clipboard, credential files or CodeRabbit connection settings.
- Datadog documents `GET /api/v2/validate_keys` as a lightweight API/application-key validation probe, returning `{"status":"ok"}` on success and 401/403 for invalid authentication/authorization. Use the fixed US3 endpoint and verify scopes separately from key validity. References: https://docs.datadoghq.com/api/latest/key-management/validate-api-and-application-keys/ and https://docs.datadoghq.com/account_management/api-app-keys/.
- Native ChatGPT Datadog app support is currently US1-only; it is not required for the Mac or CodeRabbit workflow.
- Slack workspace: **CodeRabbit Demo** (`coderabbit-demo`), ID `T0AU433PG75`; confirmed destination **#mmani-shopping-cart**, channel ID `C0CEPB2LURY`. Native Slack shows this channel in the selected workspace.
- Jira project: **ShoppingCart (`SC`)** at `https://coderabbit-demo.atlassian.net`; native read access passes. `Jira CodeRabbit Demo` shows Connected in CodeRabbit and is assigned to Base Scope and `mmani-shopping-cart`. A separate disabled Jira MCP connection has rejected credentials; do not substitute it for the connected native connection.
- Existing automation: **Datadog to Slack Automation - MMANI**, https://app.coderabbit.ai/automations/ui-c0ddcf9b-c9cb-4ae9-b52f-37e164997203. It is active, uses native Datadog webhook events `monitor.alert` and `incident.triggered`, uses Workspace default agent scope, delivers to Saved DM with CodeRabbit, and has no runs. Its current generic instructions allow a PR during initial triage and do not specify the two requested buttons.
- The native webhook wizard supplies a webhook URL and required header. Keep both out of committed examples, logs and reports. Its payload `event_type` strings are CodeRabbit-defined filters, not Datadog `$EVENT_TYPE` values.
- Mac: arm64, Bash 3.2.57, Node 24.13.0, npm 11.6.2, gh 2.100.0, gcloud 590.0.0, Terraform 1.15.3 and CodeRabbit CLI 0.9.2. Docker Desktop has been started; daemon now reports 29.5.3. Verify builder platforms separately.
- Existing locked npm dependencies were installed with `npm ci`; no manifest/lockfile changes or new dependencies are approved.
- CLI 0.9.2 supports `coderabbit auth status --agent`, `coderabbit code ls --repo . --agent`, `coderabbit code new --agent -`, and `coderabbit review --agent --committed --base-commit <sha>`. It does not support the older `--type committed` example. Start a normal coding task with a plan-only instruction; do not use `--plan` for this repository's workflow.
- `scripts/golden/open-pr.sh` currently creates/updates a PR against `main`, writes `Jira: SC-N` first, and requests `@coderabbitai test` once. Existing tests assert that exact legacy body. Retain those assertions.
- CI jobs are `typecheck`, `unit`, `golden`, `e2e`. PR gates also require CodeRabbit exact-head approval, security coverage and the Security Gate summary under the current `strict-gate.sh` rules.

## Deliverables

### 1. Read-only Mac preflight

Add `scripts/demo/preflight.mjs`, runnable with the existing Node runtime, with a helpful `--help` mode. No npm script/manifest change is needed.

Use fixed, documented demo targets or validated explicit configuration; fail on conflicting repository, GCP project, CodeRabbit organization or Datadog site rather than changing configuration. Do not accept an arbitrary Datadog host that could receive credentials.

Check:

- Required tools and runtime versions.
- Authenticated GitHub identity and access to the intended repository.
- gcloud selected account/project, CLI token refresh, and ADC token refresh. Suppress token stdout completely and do not treat a refreshed token as proof of provisioning IAM.
- CodeRabbit authentication, active `coderabbit-demo` organization and repository task-list access. Consume structured output and return only the access result; do not expose unrelated tasks or auth payloads.
- Docker daemon availability and an explicit `linux/amd64` build path. An installed client alone is not a ready daemon or builder.
- Jira identity/SC read access through available TWG commands or an explicitly documented manual prerequisite; never claim an unexecuted check passed.
- Datadog US3 API/application-key validation using securely supplied process environment credentials. Missing credentials are **blocked/not configured**, not invalid credentials. Support the documented `DD_API_KEY` plus `DD_APP_KEY`/`DD_APPLICATION_KEY` names with clear conflict handling. Never accept keys as command-line arguments. Keep key validity distinct from permission to read telemetry or manage monitors/webhooks.

Slack channel membership, automation instructions, effective Agent scope, write permissions and end-to-end handoff are manual runbook checks. List these separately; do not manufacture successful checks from a configured channel ID or saved Connected badge.

Produce a bounded structured summary with statuses such as pass/fail/blocked and safe next actions. Exit nonzero if a required automated check fails or is blocked. Use finite command/network timeouts, bounded output and argument-based subprocess execution without a shell. Complete independent checks where useful even when one fails.

The command must not log in, start Docker, switch projects/organizations, enable APIs, change configuration, read stored credential files, create Jira/Slack/GitHub resources, invoke a coding task, install software or alter cloud resources. Report these actions as operator prerequisites.

### 2. Observable tests

Add `tests/demo-preflight.test.mjs` using `node --test`. Tests must run without real service accounts, credentials, network access or Docker. Use controlled subprocess and HTTP adapters/fixtures; prevent test helpers from adding a production arbitrary-host credential path.

Assert observable summaries and exit outcomes for successful checks, missing tools/credentials, wrong targets, rejected credentials/permissions, command errors/timeouts, network failures and malformed responses. Prove that Datadog requests use only the fixed US3 validation endpoint and expected headers. Use synthetic secret markers to assert that neither stdout/stderr nor returned diagnostics include credentials, raw token/auth output, unrelated task content or webhook authentication values, including on exceptional paths. Assert that no mutation/login/task/notification commands are called.

### 3. Runbook and automation instructions

Add `docs/demo/runbook.md` and `docs/automations/datadog-to-slack-mmani.md`.

Document prerequisites, approved targets, secure environment setup without sample real keys, preflight execution and interpretation, operator responsibilities, evidence to retain, and remaining gates. Separate token validity, resource permissions, runtime readiness and live workflow proof. GCP infrastructure/deployment is Phase 2.

Provide reviewable instructions for updating the existing automation:

- Target #mmani-shopping-cart in workspace `T0AU433PG75`; reuse the existing automation instead of creating another one.
- Match only the demo service/environment/incident types. Verify actual platform filter capability; where a filter is instruction-based, describe its limitations honestly.
- Initial execution performs triage only. It must not create a ticket, dispatch CodeRabbit Code or open a PR before a button selection.
- Independent **Create Jira Ticket** and **Debug and Create PR** buttons. The latter creates/reuses the SC Bug and hands evidence, faulty branch/commit, reproduction, approved ALLOW scope and acceptance criteria to CodeRabbit Code. Both return useful status and links in the incident thread.
- Define an incident key per monitor/environment/failure episode, reuse the ticket/task/PR across deliveries and button order, and require concurrency/replay evidence. Prompt-only searches are not atomic deduplication. If native serialization is unavailable, report the integration gap instead of claiming success or inventing a backend/custom Slack app.
- Keep fault seeds and fixes on isolated demo branches. Triage/coding instructions must not merge, deploy, apply Terraform, access VM admin credentials, bypass gates or alter goldens.
- Require completed Review CLI before PR publication, CodeRabbit PR feedback on the exact head, deterministic tests and CodeRabbit QA Agent Verify evidence. Record inconclusive/unsupported results honestly.

Describe a separately controlled synthetic alert → Slack → SC Bug → disposable CodeRabbit task/PR rehearsal, its cleanup and failure reporting. Preparing the instructions does not authorize dispatching this rehearsal in the code task. Never commit the authenticated webhook endpoint/header or real incident/customer data.

### 4. GitHub issue linkage in the PR helper

Extend `scripts/golden/open-pr.sh` to recognize one optional `**GitHub:**` issue URL in a brief. When present, validate that it is a GitHub issue URL for the current repository with a positive issue number and no extra path/query/fragment. The body begins exactly:

```text
Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
Jira: SC-35
```

Use the actual metadata values, not hardcoded issue numbers. Preserve the existing brief link, verbatim results, QA request deduplication, error handling and legacy body behavior when the GitHub field is absent. Fail closed before mutation for malformed, duplicate or cross-repository GitHub metadata. Do not add support for new PR bases/options in this phase.

Add observable cases to `tests/scripts.test.mjs` for the new create/update body behavior and rejected metadata. Preserve every existing test and assertion.

## Scope

The following is the proposed allowlist for maintainer approval. It approves no dependency, manifest, lockfile, workflow or golden changes. Keep the PR below 30 changed non-golden files.

```text
ALLOW: docs/briefs/07-demo-preflight.md
ALLOW: scripts/demo/preflight.mjs
ALLOW: tests/demo-preflight.test.mjs
ALLOW: docs/demo/runbook.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
ALLOW: scripts/golden/open-pr.sh
ALLOW: tests/scripts.test.mjs
```

## Author, review and Verify

CodeRabbit Code first reports its plan, file list, test approach, capability gaps and any proposed brief correction without changing files. Wait for explicit maintainer approval before implementing.

After implementation, run the required checks and a completed `coderabbit review --agent --committed --base-commit <merge-base>`. Route valid findings through CodeRabbit Code within ALLOW, with tests for behavior/security fixes. List every finding as fixed or skipped with a reason. The Mac repeats the required pre-publication review and scope checks under `docs/PLAN.md`.

Open a PR linked to GitHub #10 and Jira SC-35 only after pre-publication gates pass. Request CodeRabbit PR review and `@coderabbitai test`; retain actual exact-head review/security and QA evidence. Do not treat an inconclusive QA result as passed Verify. For this tooling PR, separate QA's browser result from deterministic harness tests and the still-pending live incident rehearsal.

## Required checks and report

- `npm run typecheck`, `npm test`, `npm run golden:check`, `npm run build`, and existing CI/e2e/security gates as applicable. No golden updates.
- Scope gate against this approved brief and the correct merge base; meaningful red/green proof for PR-helper behavior fixes. New-module tests must assert behavior and must not manufacture a red merely because a module is absent on the base.
- Mac live preflight: report each executed result and each blocker. Missing local Datadog credentials must remain a visible blocker, even if deterministic tests pass.
- Report changed files, test results, CLI/PR findings and dispositions, QA run/head/verdict, and the exact operator actions still needed for Phase 1's operational exit. Do not claim the automation, Jira write or end-to-end delivery has been proven by this PR alone.
