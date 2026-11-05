<!-- coderabbit-ai-generated:v1 -->

# Slack incident bridge preparation

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:70e1aeea6b3ed67c53948e0e63e0528c7834b0895c356194ec64fdac7324d22d -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:900f3c31126dd5a7bfa6a72090e95dcc012eb9a1f286348ef79587b9d0bdb731 -->

The bridge is under development and is not ready for activation. The receiver, approval control, supervised task adapter and delivery checks are implemented, but automatic preparation of the exact CodeRabbit-authored checkout, complete push/review/PR reconciliation, and ongoing invalidation of stale Verify handoffs remain open. The offline QA journey uses spawned fake external CLIs. The Slack manifest and Datadog template are proposals. No app, webhook, tokens, monitor changes or live integrations are created by this repository.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

The bridge uses an incoming-webhook URL as a bearer credential. Slack app and bot identity, an approved human clicker and read-only monitor ownership checks do not independently prove Datadog authored an event. Keep the URL only in the separately approved Datadog destination, never in source, output, chat or logs. Install an app only after a separately reviewed activation grant. Bot scopes are `chat:write` and `incoming-webhook`; the Socket Mode app-level token requires `connections:write`.

The payload uses `$DATE_POSIX` in seconds and includes `$ALERT_TITLE`, `$EVENT_TITLE` and `$EVENT_TYPE`. Test classification uses title evidence, not the event category. Datadog field formats, substitution and nested JSON escaping must be proven with a separately approved live preflight. An unresolved or missing cycle or host blocks action; never infer a cycle from a timestamp, event ID or summary.

Keep bridge configuration and state under a current-user-owned private directory with mode 0700 and files mode 0600. Do not accept symlinks or hardlinks. The Slack token file contains only `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`; do not put token values in repository files or chat. TWG and CodeRabbit use their existing local authenticated profiles. Do not copy credentials into child environments, SQLite, prompts or logs.

The eventual cutover must retain the old route until a separately approved one-event test proves the new app's receipt, identity and callback. Roll back by restoring the old routing under that grant. A future CodeRabbit channel-message trigger can be reviewed separately; bot mentions are not a verified dispatch mechanism. No live issue, task, PR or cloud proof follows from offline tests.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:5851adbf10943cfec778ed8ac38e8820d0c6efd9718a408c4b69618d887d80ef -->

## Operator commands and offline QA

The following commands describe a future separately approved setup; do not enter secrets in the command line or chat. With Node 24.13 or newer and the installed subpackage, `node tools/slack-bridge/src/main.mjs init` initializes private state once. Place reviewed `config.json`, `slack.env` and `approval.json` in `~/.deskdrop-slack-bridge` with mode 0600. Config must pin the app/bot and allowed actor IDs, executable paths, current monitor query/owner/tags, action window and an explicit private Datadog credentials file containing only `DD_API_KEY` and `DD_APP_KEY`. The Slack file contains only `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`. Protect all files from other users; the database and initialization marker must be restored together.

`node tools/slack-bridge/src/main.mjs doctor` performs read-only preflight. `node tools/slack-bridge/src/main.mjs run` runs the foreground receiver; `node tools/slack-bridge/src/main.mjs status` shows durable state. An authorized operator may reconcile an unknown Jira write using `node tools/slack-bridge/src/main.mjs reconcile-jira EPISODE_HASH SC_KEY NUMERIC_ID`; native readback must verify the exact marker before confirmation. Never retry an unknown write based on an empty search. The task approval binds repository, source and base commits, branches, allowed paths, owner, window and budget; a changed record invalidates its revision. Gross turn minutes are observations, not a vendor billing cap.

Run `npm --prefix tools/slack-bridge ci`, `npm --prefix tools/slack-bridge test` and `node tools/slack-bridge/qa/scenario.mjs` for offline verification. The scenario leaves a private temporary database and synthetic call/transition receipt and prints their paths. Its fake CLI review and PR are not live evidence. Native Verify on the exact feature head remains required. Private infrastructure, deployment, reboot, telemetry and publication checks retain their existing requirements.

<!-- /coderabbit-ai-generated:v1 -->
