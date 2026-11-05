<!-- coderabbit-ai-generated:v1 -->

# Slack incident bridge preparation

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:70e1aeea6b3ed67c53948e0e63e0528c7834b0895c356194ec64fdac7324d22d -->

This implementation is under development and is not ready for activation. It does not yet provide a foreground Socket Mode entry point, live CodeRabbit CLI adapter, independent deadline/cancel supervisor, PR delivery, a human approval control, or a complete restart/reconciliation path. The task coordinator and QA journey currently use injected fake adapters. The Slack manifest and Datadog template are proposals. No app, webhook, tokens, monitor changes or live integrations are created by this repository.

<!-- /coderabbit-ai-generated:v1 -->

The bridge uses an incoming-webhook URL as a bearer credential. Slack app and bot identity, an approved human clicker and read-only monitor ownership checks do not independently prove Datadog authored an event. Keep the URL only in the separately approved Datadog destination, never in source, output, chat or logs. Install an app only after a separately reviewed activation grant. Bot scopes are `chat:write` and `incoming-webhook`; the Socket Mode app-level token requires `connections:write`.

The payload uses `$DATE_POSIX` in seconds and includes `$ALERT_TITLE`, `$EVENT_TITLE` and `$EVENT_TYPE`. Test classification uses title evidence, not the event category. Datadog field formats, substitution and nested JSON escaping must be proven with a separately approved live preflight. An unresolved or missing cycle or host blocks action; never infer a cycle from a timestamp, event ID or summary.

Keep bridge configuration and state under a current-user-owned private directory with mode 0700 and files mode 0600. Do not accept symlinks or hardlinks. The Slack token file contains only `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`; do not put token values in repository files or chat. TWG and CodeRabbit use their existing local authenticated profiles. Do not copy credentials into child environments, SQLite, prompts or logs.

The eventual cutover must retain the old route until a separately approved one-event test proves the new app's receipt, identity and callback. Roll back by restoring the old routing under that grant. A future CodeRabbit channel-message trigger can be reviewed separately; bot mentions are not a verified dispatch mechanism. No live issue, task, PR or cloud proof follows from offline tests.

Run `npm --prefix tools/slack-bridge ci` and `npm --prefix tools/slack-bridge test` for the currently implemented offline boundaries. Native Verify on the exact feature head remains required. Private infrastructure, deployment, reboot, telemetry and publication checks retain their existing requirements.
