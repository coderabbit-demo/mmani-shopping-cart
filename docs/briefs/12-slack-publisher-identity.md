# Slack bridge live publisher identity repair — APPROVED

## Observed failure

PRs 16 and 19 are merged. Native Datadog TEST event 8885937405143100432 reached the dedicated MMANI Demo Bridge card at https://coderabbitdemo.slack.com/archives/C0CEPB2LURY/p1793906009745419. Both intended buttons render. Actual callbacks pass the app, workspace, channel, operator and native incident checks but fail the source bot guard before registration or any Jira call.

The approved app A0CF4HW2FM3 has OAuth identity mmani_demo_bridge / user U0CF9QU01PU / bot B0CF81RKQLW. Its issued incoming-webhook service identity and observed message publisher are B0CF4MJ3885. The current code uses one config.botId for both auth.test and callback message.bot_id; replacing that one value cannot satisfy both checks. No Jira Bug, downstream remediation task or PR was created by these clicks. Sanitized evidence: /private/tmp/deskdrop-slack-live-identity-comparison.json.

## Concrete repair

Keep the OAuth bot identity independently pinned for startup auth.test. Add an explicitly enrolled publisher identity for native webhook cards, and require it in the existing exact app/team/channel/actor/message/card checks. Never adopt an arbitrary first-click publisher and never rewrite the callback or auth.test result to satisfy a guard. Preserve canonical payload validation, owned monitor preflight, replay/concurrency fencing and the separate coding approval requirement.

Before allowing a Jira write, verify that the authenticated app can update the existing synthetic source card while preserving its content and controls. Slack documents chat.update ownership constraints; do not assume that splitting identity pins also fixes update ownership. If this app can update its own webhook message, retain the durable update path. If Slack rejects that ownership, introduce a bot-authored control/status message in the same incident thread with an independently verified OAuth-bot publisher, durable source-to-control binding and existing unknown-outcome fencing. Do not use an expiring response_url as the durable update mechanism, persist that URL, add Slack scopes or weaken identity checks. The CodeRabbit plan must make the chosen transport and safe retry behavior concrete before implementation.

Use a new issue for this live regression and associate the follow-up with existing SC-39; no additional Jira implementation Task or incident Bug is requested. Use one new CodeRabbit Code task on a codex/ branch from verified main 80bf508820d1419a3fa0600a8b3c3dd8fc2405a6, with Autofix off, one completed CodeRabbit CLI review, exact-head CodeRabbit PR/security/CI feedback, and native CodeRabbit QA Agent Verify. Coding has no time or cost cap, per Mahesh's standing instruction. Leave the follow-up PR unmerged pending its own merge authorization.

## Proposed file scope (18 paths; no dependency changes)

ALLOW: tools/slack-bridge/src/config.mjs
ALLOW: tools/slack-bridge/src/cards.mjs
ALLOW: tools/slack-bridge/src/main.mjs
ALLOW: tools/slack-bridge/src/actions.mjs
ALLOW: tools/slack-bridge/src/slack.mjs
ALLOW: tools/slack-bridge/src/state.mjs
ALLOW: tools/slack-bridge/src/state-worker.mjs
ALLOW: tools/slack-bridge/tests/config.test.mjs
ALLOW: tools/slack-bridge/tests/actions.test.mjs
ALLOW: tools/slack-bridge/tests/adapters.test.mjs
ALLOW: tools/slack-bridge/tests/state.test.mjs
ALLOW: tools/slack-bridge/tests/fixtures/cli.mjs
ALLOW: tools/slack-bridge/tests/slack.test.mjs
ALLOW: tools/slack-bridge/qa/scenario.mjs
ALLOW: deploy/slack/bridge-config.example.json
ALLOW: docs/demo/slack-bridge.md
ALLOW: docs/briefs/12-slack-publisher-identity.md
ALLOW: docs/automations/datadog-to-slack-mmani.md

State files are allowed only if the verified update transport needs durable source/control binding; otherwise leave them unchanged. No manifest/lock, dependency, app permission, Datadog payload, storefront, golden, Docker or cloud change.

## Acceptance and live verification

- Separate trusted OAuth and webhook publisher identities work when different; equal identities remain supported if explicitly pinned. Missing, malformed and foreign pins fail closed. Existing foreign app/workspace/channel/operator and all native incident regressions remain intact.
- No Jira side effect occurs until a valid card has usable controls. Source/control binding survives restart and replay. Failed or ambiguous message publication cannot create duplicate control cards or Jira issues. Existing tests and assertions are preserved; each changed behavior receives observable regression coverage.
- Full bridge suite and both offline scenarios, root relevant gates, exact-head PR/security/CI and native QA pass. Exactly one CLI review for this new coding task; no extra CLI reviews for PR fixes.
- After reviewed build activation, reuse the already-approved local activation envelope: at most two remaining native Datadog TEST notifications, at most one incident SC Bug across all verification, replay of Create Jira Ticket and Debug returning approval_required without any downstream CodeRabbit remediation task. The original TEST did not create a Bug.
- Existing Datadog routes and all three exact-ID suppressions stay intact. No fault seed, deployment, image publication, new scopes or automatic merge.

## Approval history

The November 5 live activation grant explicitly excluded coding tasks; the subsequent merge grant covered PRs 16 and 19. Mahesh approved this focused implementation on November 5, 2026, through the approval reply in this chat. The harness may approve a matching CodeRabbit plan and continue within these exact boundaries. No additional budget/window approval is requested.

## Primary Slack references

https://docs.slack.dev/reference/methods/auth.test/
https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
https://docs.slack.dev/reference/methods/chat.update/
https://docs.slack.dev/interactivity/handling-user-interaction/

Jira association: https://coderabbit-demo.atlassian.net/browse/SC-39 (reuse existing implementation Task).

Native card-update transport probe is pending before implementation. No Jira action is permitted until usable card updates are proven.

GitHub regression issue: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/20
