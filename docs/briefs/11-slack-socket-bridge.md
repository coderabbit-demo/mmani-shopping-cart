# `feat: add a local Slack incident-action bridge`

Status: APPROVED by Mahesh on November 5, 2026, including all 27 files, the pinned SDK, Node/SQLite choice and the 40-minute budget/window below. The harness may approve a matching CodeRabbit plan and continue the same task. This document does not authorize installing an app, creating credentials, changing Datadog routing, sending notifications or launching live incident actions.

**GitHub:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/18, related to https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
**Jira:** https://coderabbit-demo.atlassian.net/browse/SC-39 (new implementation Task assigned to Mahesh; SC-37/SC-38 remain separate).

## Approved implementation grant

- One normal CodeRabbit Code feature task, including its planning/implementation and any PR-fix turns; no Autofix. The harness may approve the CodeRabbit plan only when it matches this exact brief.
- Up to 40 additional reported CodeRabbit Agent minutes, including metered native QA. Record reported units honestly; Code CLI terminal turn minutes are gross rounded usage, not a live billed-spend API. No automatic extension.
- Start on approval; end November 5, 2026 at 11:00 AM America/Los_Angeles (2026-11-05T19:00:00Z). Do not start after that cutoff.
- Exactly one completed CLI review for the new coding task before PR publication. A completed in-task review counts; never add a duplicate Mac review. PR-fix turns are exempt. Exact-head PR/security/CI feedback and native CodeRabbit QA Agent Verify remain required.
- At most one feature PR, open against main and left unmerged; one new GitHub implementation issue and one new SC implementation Task assigned to Mahesh. Live incident Bug creation and demonstration CodeRabbit tasks are not included yet.
- Approve the exact SDK dependency: ALLOW: dependency @slack/bolt@5.1.0, isolated in tools/slack-bridge/package.json and its lockfile. Root package.json/package-lock.json remain unchanged.
- Accept Node 24.13.0 or later for this separate operator harness, including the documented experimental built-in node:sqlite facility. No Node installation or storefront engine change is needed; the Mac already runs 24.13.0.
- Slack installation/scopes/tokens, Datadog cutover, and bounded live probes are a final separately reviewable activation step after offline implementation and verification.

## Goal and boundaries

Replace CodeRabbit-owned automation button dispatch, which failed before agent startup with automation_context_protocol_pin_unavailable, with a dedicated Slack app and a foreground Mac worker. Keep CodeRabbit Code as the code author, CLI and PR review as feedback, and CodeRabbit QA Agent as Verify. The storefront remains Next.js/React/localStorage-only; this is an independent operator harness, not an application backend.

Base is main at f7a859dfe151a78a71dc8d6e3c5d87385eb6c8e1, on prepared branch codex/slack-socket-bridge. Existing Docker checkout at48363c8, its runtime/state/secrets, PR16 and the merged shipping rehearsal branches are untouched. Do not merge PR16 as a prerequisite or import its unmerged local-controller modules.

No app code, cart behavior, goldens, root npm manifests, Docker images/controls, monitor definitions, Terraform/cloud, shared CodeRabbit scopes or existing Slack automation settings may change in implementation. Documentation may describe proposed activation; it must not claim live proof.

## Verified ingress and ownership design

1. Datadog custom webhook sends a credential-free payload template to a NEW incoming-webhook URL owned by the dedicated Slack app and bound to CodeRabbit Demo/#mmani-shopping-cart. The actual URL stays out of source, logs and chat.
2. The payload contains native Datadog monitor/event/alert-cycle identity and the app's own two Block Kit buttons. Slack's incoming webhooks support interactive components. Socket Mode delivers this app's clicks to the Mac over an outbound WebSocket; the Mac has no public HTTP listener.
3. Native macros: $ALERT_ID is monitor ID; $ID is event ID; $ALERT_CYCLE_KEY links an alert through resolution; $ALERT_SCOPE, $HOSTNAME, $ALERT_TRANSITION, $ALERT_TITLE, $EVENT_TYPE and $DATE_POSIX provide scope/state/test evidence. Keep large provider IDs as strings. Reject unresolved macros, missing identity, malformed/oversized payloads and conflicting fields. Do not derive or guess alert-cycle identity from an LLM summary or a timestamp.
4. The incoming-webhook URL is a bearer integration credential, not a preserved Datadog cryptographic signature. Document this trust boundary. Validate the Slack-supplied receiving app/team/channel and original message's own bot identity, the human actor, the canonical provider contract, and current read-only US3 monitor ownership before any Jira/task side effect. Never treat arbitrary human-pasted JSON or display names as authenticated ingress.
5. First clicks on the app-owned native card may bootstrap registration only after all fast authenticity/schema/scope checks. Bind the canonical incident and source card transactionally, replace button values with random stored opaque handles, and require exact binding/fencing on every later action. Changed bootstrap data for an already-known card is rejected. Unknown handles are never adopted.
6. Initial alert delivery creates no Jira issue or CodeRabbit task. Recovery/unknown transition clicks report a blocked/non-actionable result; they do not launch remediation. TEST notifications are labeled synthetic and never described as verified current product faults.
7. Keep the existing CodeRabbit webhook route and original automation untouched until activation is reviewed. A later cutover can preserve CodeRabbit initial triage through its documented top-level Slack-message trigger watching the new app; do not depend on unverified bot-generated @CodeRabbit mention dispatch. Existing CodeRabbit-owned buttons are not repaired or intercepted by this app.

## Workspace, actor and credential contract

- Fixed Slack team T0AU433PG75 and channel C0CEPB2LURY. App/bot identities and Mahesh's allowed actor ID are installation-preflight inputs, not guessed values. Startup refuses placeholders/mismatched auth.test identity. Separate Jira and Debug action permissions.
- Proposed app name MMANI Demo Bridge. Bot scopes ONLY chat:write and incoming-webhook; separate app-level token connections:write; Socket Mode/interactivity enabled. No history, user-directory, join, public-post, event-subscription or user-token scope is needed for the callback-only design.
- US3 monitors29524154/29524290/29524292; service deskdrop, env local-demo, demo_id mmani-shopping-cart-local, host deskdrop-mmani-local; current owned-query/tag/owner verification is required. Read-only API access only. Do not call mute, unmute, create, update or delete monitor APIs.
- Separate private ~/.deskdrop-slack-bridge directory0700; credentials/config/database/WAL/SHM files0600, owned by the current user, no symlink/hardlink adoption. The Slack token file accepts only the two documented token variables. Existing authorized DD credentials may be loaded privately from an explicit approved secure file for read-only checks. No secret enters SQLite, child environments, prompts, argv, test fixtures, CodeRabbit, Git or logs.
- Jira uses the existing authenticated local TWG CLI for coderabbit-demo.atlassian.net, SC/ShoppingCart, not copied CodeRabbit OAuth tokens or a new Jira API key. Discover/validate current required create fields; block if unresolved rather than inventing values. Native readback confirms every successful write.

## Durable state, retries and process boundary

Use built-in SQLite in a dedicated worker thread with short transactions, unique constraints, bound SQL, no extension loading, and a monotonic fencing revision. SQLite/CLI/network waits must not block Slack acknowledgements. Ack promptly (within Slack's3-second requirement); acknowledgement is not action success. Never reuse the old controller's empty lockfiles or journals.

Persist incidents, source deliveries/cards, action attempts, one shared Jira artifact per episode, one task artifact, approval/budget reservations and a status outbox. Mixed Jira/Debug clicks share the Jira claim. Episode identity includes approved site/monitor/host/env/service and exact native alert-cycle key; event ID remains a delivery identity. A new provider cycle gets a new episode.

States must distinguish ready, claimed, dispatch-intent, confirmed/running/completed, proven-prestart failure and outcome-unknown/reconcile-required. Persist dispatch intent before external calls and authoritative IDs before reporting success. Retry is allowed only after proof that no external start occurred (for example spawn ENOENT before a child existed). A nonzero exit, timeout, lost output, crash after possible submission, absent search result or expired lease does not prove no artifact was created. Never replay an ambiguous Jira create or CodeRabbit new. Persist unknown outcomes and give a visible operator reconciliation path. Restart resumes known artifact polling and safe local preparation; it preserves uncertain dispatch fences.

Local SQLite uniqueness coordinates this worker's participating processes; it is not atomic create-if-absent in Jira/CodeRabbit. An unknown initial Slack post must be reconciled before reposting. Failed status delivery must not reopen completed artifact claims. Refuse a missing database after an initialized installation rather than silently creating a new empty history.

Adapters use verified fixed executable paths/verbs/argument arrays, shell:false, a fixed approved working directory, bounded stdin/output/deadlines and a minimal environment. Slack/model text never becomes a shell command, executable, flag, branch, repository or filesystem path. Diagnostics enter a fixed task template as escaped data. No raw provider errors, payloads, authentication material, WebSocket URLs/tickets or page bodies in logs.

## Button behavior and code lifecycle

Create Jira Ticket: after authorization and ownership checks, create/reuse one SC Bug for the validated episode, label TEST evidence honestly, persist/read back its key, and update the same Slack thread/card. Jira required-field errors are visible and never represented as creation success.

Debug and Create PR: reuse the SAME Jira artifact, then require a protected current approval record containing exact repository, faulty pushed branch/commit, allowed files, PR base, owner, positive task/time cap and execution window. Without it, acknowledge and report blocked. No inference of a code defect solely from a TEST notification or a stopped service.

Start a NORMAL CodeRabbit Code task with a plan-only first instruction. Never use --plan: project policy requires a normal task that can continue. Persist the returned task ID immediately. A plan approval control must reference that stored task and approval revision; only an approved human may continue it with the static scoped implementation instruction. No AutoFix, no arbitrary goal mode, no merge/deploy/fault commands.

One-shot coderabbit code new/resume/show/push/cancel contracts are supported. The current CLI has no native budget/window/idempotency flag and no live billed-Code meter. Use an external wall-time deadline/cancel supervisor, reserve approved effort conservatively, accumulate non-null observed terminal turn minutes, and stop automatic paid continuation if usage/cancellation/submission outcome is unknown. Do not promise an exact server-enforced monetary cap. Null historical-resume usage is not zero.

Delivery must preserve the CodeRabbit-authored commit, prove ALLOW/golden/assertion invariants, and complete exactly one valid CLI review before PR publication. If the in-task review completed, use it; otherwise the Mac performs the single fallback against the approved base. PR-fix turns do not add CLI reviews. Create at most one PR for the episode against the approved isolated base, with its associated issue URL as first Fixes line, then monitor exact-head PR/security/CI results. Never use open-pr.sh for an isolated non-main base because it hardcodes main.

## Verify boundary

Current public CodeRabbit CLI/docs provide no supported automated Verify command/API or verified @coderabbitai test trigger. Implement an honest awaiting-Verify handoff containing exact PR/head and native Verify location. Do not call a private API, invent a comment command, or count an agent's own report as native QA proof. The active Codex/Mac harness can run the native Verify UI and record its exact-head result during a separately bounded rehearsal. Standalone unattended completion remains gated on a supported Verify trigger.

For THIS feature PR, run one native QA Agent journey on its exact head in the existing prepared sandbox. The journey exercises the credential-free offline scenario harness through real state/actions with fake external adapters. This is offline contract proof, not live Slack/Jira proof; preserve that distinction. Existing storefront checkout QA is not proof of the bridge.

## Exact ALLOW list —27 files, fewer than30

ALLOW: tools/slack-bridge/package.json
ALLOW: tools/slack-bridge/package-lock.json
ALLOW: tools/slack-bridge/src/main.mjs
ALLOW: tools/slack-bridge/src/config.mjs
ALLOW: tools/slack-bridge/src/cards.mjs
ALLOW: tools/slack-bridge/src/incidents.mjs
ALLOW: tools/slack-bridge/src/state.mjs
ALLOW: tools/slack-bridge/src/state-worker.mjs
ALLOW: tools/slack-bridge/src/actions.mjs
ALLOW: tools/slack-bridge/src/slack.mjs
ALLOW: tools/slack-bridge/src/jira.mjs
ALLOW: tools/slack-bridge/src/coderabbit.mjs
ALLOW: tools/slack-bridge/src/process.mjs
ALLOW: tools/slack-bridge/tests/config.test.mjs
ALLOW: tools/slack-bridge/tests/incidents.test.mjs
ALLOW: tools/slack-bridge/tests/state.test.mjs
ALLOW: tools/slack-bridge/tests/actions.test.mjs
ALLOW: tools/slack-bridge/tests/adapters.test.mjs
ALLOW: tools/slack-bridge/tests/fixtures/cli.mjs
ALLOW: tools/slack-bridge/qa/scenario.mjs
ALLOW: deploy/slack/socket-mode-manifest.json
ALLOW: deploy/slack/datadog-payload.json
ALLOW: deploy/slack/bridge-config.example.json
ALLOW: docs/demo/slack-bridge.md
ALLOW: docs/briefs/11-slack-socket-bridge.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
ALLOW: .github/workflows/ci.yml
ALLOW: dependency @slack/bolt@5.1.0

The dependency ALLOW is not a file. Preserve root npm files and every existing test/assertion/golden. New package lock matches its one pinned direct SDK dependency and ordinary transitive resolution. No other direct dependency is approved. Add a separate Node24.13 CI job that installs/tests only this subpackage; existing jobs stay intact.

## Acceptance and validation

- node --test behavior tests with actual private SQLite files/worker threads and spawned fake CLI processes; no credentials or live writes. Do not test mere imports or mirror implementation internals.
- Verify known own-app bootstrap, exact schema/provider identities, string IDs, immutable card binding, foreign app/team/channel/actor rejection, malformed/oversized/unresolved macros, TEST/recovery handling, scope/ownership rejection and no side effects on preflight errors.
- Real cross-process same/mixed-button concurrency; repeat envelopes/clicks; shared Jira artifact; fencing; crash/restart before and after dispatch/ID persistence; unknown outcomes never replay; pre-spawn failure safely retries; status outbox failure never recreates artifacts.
- Blocked SQLite/slow CLI tests must still observe prompt acknowledgement. Test expired/changed approval, budget exhaustion, null usage, timeout/cancel ambiguity, fixed argv/env, command-injection payloads as data, token/file redaction and permissions/symlink failures.
- Offline end-to-end scenario: valid native incident -> two callbacks -> exactly one fake Jira creation/reuse and one normal CodeRabbit task; plan approval -> implementation/delivery/review/PR statuses; unverified native QA remains awaiting-Verify, never fabricated PASS.
- Run the new subpackage tests/scenario, root units/typecheck/goldens/build/relevant existing Playwright checks, scope gate and exact-head CI/PR/security gates. Every new behavior needs an observable test. Goldens unchanged.
- CodeRabbit feedback only, retaining Mahesh's override of the four additional judges. Validate findings; fix within these ALLOW paths. Report out-of-scope issues without expanding files.
- Native QA on exact feature head, one completed CLI review and full finding dispositions, source/base/PR/task identity, gross/QA Agent-minute ledger and explicit live-proof limits.

## Final activation package (prepare, do not execute yet)

Prepare the exact Slack manifest, credential-file instructions, read-only doctor, Datadog payload and cutover/rollback plan. App installation grants new access and token generation needs the user's secure setup; never ask for tokens in chat. The actual incoming webhook URL may only be transferred to the explicitly approved Datadog webhook configuration. Keep current monitors suppressed and the old route available until an approved one-event test proves new receipt/identity/callbacks. A later live rehearsal must bound one SC Bug and any demonstration CodeRabbit task/PR, with a new explicit budget/window. Do not claim live issue creation/task/PR execution from mocked tests or visible buttons alone.

## Primary references checked

- Slack Socket Mode: https://docs.slack.dev/apis/events-api/using-socket-mode/
- Slack incoming webhooks and interactive components: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
- Slack action handling: https://docs.slack.dev/tools/bolt-js/concepts/actions/
- Datadog native webhook variables: https://docs.datadoghq.com/integrations/webhooks/
- Official SDK registry: https://registry.npmjs.org/@slack%2fbolt/latest (5.1.0 verified)
- Node24.13 SQLite: https://nodejs.org/download/release/v24.13.0/docs/api/sqlite.html
- CodeRabbit cloud CLI: https://docs.coderabbit.ai/cli/cloud-tasks

