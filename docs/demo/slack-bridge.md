# Custom Slack bridge — paused

Presenter entry points: [setup](local-setup.md), [Do / Say / See](incident-walkthrough.md), and [GCP next phase](gcp-team-handoff.md). The custom receiver remains outside the active demo.

The active demo uses the original CodeRabbit automation, not this receiver. Follow the [native automation runbook](../automations/datadog-to-slack-mmani.md) for Datadog TEST delivery and its two independent buttons: Jira creation, or direct repository debugging and a warranted fix PR. Debug must not use or require a Jira ticket. The requested repository scope, approved duplicate-MCP exclusion and concise display adjustment were tested successfully: both native controls rendered, Debug investigated first without reproducing a defect, then Jira created SC-41. No coding task or fix PR was produced; native CodeRabbit Code discovery/handoff authentication remains a verification gap.

## Current status

[PR19](https://github.com/coderabbit-demo/mmani-shopping-cart/pull/19) merged the separate Mac Socket Mode implementation on November 5, 2026. Its 65 behavior tests, both offline scenario modes, CodeRabbit review and exact-head native QA passed. Those scenarios use fixture providers; they are not live Slack/Jira remediation proof.

The separately approved live setup installed **MMANI Demo Bridge** in CodeRabbit Demo and privately enrolled its existing credentials. One Datadog TEST reached the app-owned incoming-webhook card and rendered both controls. Live testing found two restrictions:

- The incoming-webhook publisher identity differs from the OAuth bot identity returned by `auth.test`; the receiver's single identity pin rejected the callback before a Jira call.
- A same-content `chat.update` probe on that webhook card returned `cant_update_message` for the OAuth bot. A robust repair would require separately pinned identities and a durably bound bot-authored control message.

The receiver is stopped. [Issue20](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/20) and CodeRabbit task `d27d8554-9c9b-4c2c-a513-0732b9d9dfee` reached planning only; Mahesh paused the repair. No repair implementation, follow-up PR or custom-bridge incident Bug was created. The original Datadog route was retained and its native Jira button subsequently created SC-40 successfully. An approved native Debug rehearsal then failed during Prepare before any coding task/PR, prompting a temporary Jira-only rollback. The requested repository scope is now restored with its approved duplicate-MCP fix. A separately approved retest verified native button rendering, independent repository investigation and SC-41 creation. See the native runbook for the exact evidence and remaining fix-PR limits.

Do not restart the custom receiver or route new notifications to it as part of the native automation demo. Its old Slack cards are separate from the native CodeRabbit incident buttons.

## Private configuration and state

Keep existing operator files under the current-user-owned `~/.deskdrop-slack-bridge` directory with mode 0700 and files mode 0600. Preserve the SQLite database and initialization marker together; do not remove them to bypass a blocked action. Do not copy credentials into source, prompts, SQLite or logs.

The Slack credential file contains only `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`. Private Datadog management credentials contain only `DD_API_KEY` and `DD_APP_KEY`. The approved app uses bot scopes `chat:write` and `incoming-webhook`, with app-token scope `connections:write`. No additional scope is implied by the paused implementation or this documentation.

The incoming-webhook URL is a bearer credential. Receiving-app identity and monitor checks alone do not prove Datadog authored an event. Never publish the URL, required headers, response URLs or token values.

## Offline implementation reference

The separate operator package requires Node 24.13 or newer and the pinned Bolt dependency. Its source includes canonical incident validation, owned-monitor checks, transactional SQLite claims, Jira reuse, protected plan approval, supervised CodeRabbit tasks, review/PR reconciliation and an explicit exact-head native-Verify handoff.

Credential-free checks:

```sh
npm --prefix tools/slack-bridge ci
npm --prefix tools/slack-bridge test
node tools/slack-bridge/qa/scenario.mjs
node tools/slack-bridge/qa/scenario.mjs --uncapped
```

These checks are not native provider activation. Their fake task, CLI review, PR and Verify handoff must not be presented as live completion.

The reviewed protected coding policy supports explicitly approved uncapped operation, alongside optional limited operation. Missing usage is unknown rather than zero. Actor/source/ALLOW scope, human plan approval, durable dispatch intent and uncertain-outcome fences remain required. Schema v2 preserves historical v1 state through transactional migration; stop old workers before an upgrade and back up private state. No new state migration was implemented for the paused publisher repair.

Future repair or reactivation requires a current reviewed source/transport plan and explicit permission to resume. It must preserve known artifact identities, prevent duplicate control publication after ambiguous responses, prove usable controls before Jira writes, and complete current review and native QA gates. Until then, use the native route and its independently recorded limits.
