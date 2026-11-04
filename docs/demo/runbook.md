<!-- coderabbit-ai-generated:v1 -->

# DeskDrop Phase 1 preflight runbook

## Targets and responsibilities

The operator runs this read-only harness on the Mac from the `coderabbit-demo/mmani-shopping-cart` checkout. Targets are Google Cloud project `se-demos-project`, Datadog US3, Jira ShoppingCart (`SC`), and CodeRabbit Demo Slack workspace `T0AU433PG75`, channel `#mmani-shopping-cart` (`C0CEPB2LURY`). Phase 1 is tracked by [GitHub #11](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/11) and Jira SC-35; [#10](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10) remains the parent tracker for later work.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1ca464ca55c9a44eb142751964129407ccf25a5b137a23197b9fb5417f1a31e3 -->

Use Node 22.6 or later, npm, Git, gh, gcloud, Terraform, Docker Desktop with Buildx, and CodeRabbit CLI. Prepare authentication, project selection and Docker manually before running; the command does not log in, switch configuration, start services, install tools, or create resources. See [automation instructions](../automations/datadog-to-slack-mmani.md) for the separate operator-controlled change and rehearsal.

The PR helper requires development dependencies installed with `npm ci`. The preflight itself uses Node built-ins only.

<!-- /coderabbit-ai-generated:v1 -->

## Secure credentials and execution

Supply `DD_API_KEY` and either `DD_APP_KEY` or `DD_APPLICATION_KEY` in the process environment using an approved secure injection mechanism. If both application-key names are set they must agree. Do not put values in command arguments, shell history, logs, source files or reports; do not retrieve them from browser pages, clipboard, credential files or saved CodeRabbit connections. The command uses only the fixed US3 validation endpoint, without redirects. If local credentials are unavailable, leave them unset and report the resulting blocker.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:dcb67cfe5875ded0263e340b9efc9fcd775fcfe2e27ae4dcef69f412b030a19a -->

For example, in a dedicated Bash session, type the values at silent prompts:

```bash
read -r -s -p "Datadog API key: " DD_API_KEY
printf '\n'
read -r -s -p "Datadog application key: " DD_APP_KEY
printf '\n'
export DD_API_KEY DD_APP_KEY
node scripts/demo/preflight.mjs --help
node scripts/demo/preflight.mjs
unset DD_API_KEY DD_APP_KEY
```

Close the dedicated session afterward. Check for a conflicting `DD_APPLICATION_KEY` variable without printing its value.


<!-- /coderabbit-ai-generated:v1 -->
The JSON output gives `pass`, `fail`, or `blocked` per automated check, safe next actions, manual checks and an exit code. Nonzero means at least one required automated check failed or is blocked. Unknown CLI formats, command timeouts and network failures must be investigated; they are not passing evidence. Keep the summary without credentials and record the date, checkout commit, operator and CLI versions separately. Token refresh can use the CLI's own authentication cache; never record token output.

## Interpret the checks

- GitHub authentication and repository read access are checked separately from CodeRabbit. Confirm the intended identity and repository.
- gcloud account/project selection, CLI token refresh and ADC token refresh are distinct. Refreshing a token proves neither provisioning IAM nor ADC quota-project alignment. An authorized operator checks granular project, state and IAP permissions separately, without creating keys or resources.
- CodeRabbit authentication, active organization and task-list access are separate. A list operation does not prove the ability to create tasks or PRs. A saved Connected badge does not prove effective Agent access. If the CLI output cannot establish the selected organization, verify it manually and treat the automated result as blocked.
- A Docker client is not a daemon. A running builder advertising `linux/amd64` is evidence of a build path, not proof of a successful image build. Verify a real build only during separately approved deployment work.
- Datadog key validation proves only that US3 accepted the API/application pair. It does not prove telemetry read, monitor/webhook management, Agent intake or CodeRabbit connection permissions. Missing keys are blocked, not invalid. A 401/403 needs an authentication or authorization investigation; never record the response body.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:17556e117d8ec4501acbc7988aa829b6135a0458070cef2007d6d900e30d7f45 -->

- Jira identity and SC read access are manual; record the evidence. Verify Slack membership, effective Agent scope, channel delivery, connection permissions and automation behavior separately. No channel ID or connection badge proves these capabilities.
- Before rehearsal, separately establish and record evidence for Slack channel writes, Jira SC Bug creation, and CodeRabbit task plus GitHub PR creation using the acting identities and disposable targets. Read access, connection badges and effective scope are distinct from these capabilities. Any write check requires separate authorization; preparing this runbook runs none. See the [capability and rehearsal checklist](../automations/datadog-to-slack-mmani.md#capability-proof-and-controlled-rehearsal).

<!-- /coderabbit-ai-generated:v1 -->

## Gates and evidence

For the implementation retain focused tests, typecheck, unit, golden, build and applicable e2e/CI results and scope-gate output. The maintainer requires one completed CodeRabbit CLI review per new coding task before completion or publication; an in-task run counts and the Mac is fallback only when none completed. Record task ID, reviewed commit/base, completed result and all findings with dispositions. A PR-fix task or round is exempt from this CLI rule. Exact-head PR review, security gates and deterministic tests still apply.

Request CodeRabbit QA Agent Verify on the PR. Retain its URL, tested revision, scenario outcomes and browser evidence. An inconclusive or stale result is not a pass. This tooling PR's deterministic checks do not prove the live incident workflow.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c6874e2dd8de747353f7577218f33de4cbb501ff874745695ce0534fe1aa89ef -->

Before activation or rehearsal, complete and approve the [operator scope record](../automations/datadog-to-slack-mmani.md#scope-record-required-before-activation) with exact values, native event types, actual payload mappings and evidence. The intended availability, cart-journey and missing-checker cases come from the parent monitoring contract; exact deployed values and field mappings remain pending. Incomplete scope blocks activation and rehearsal.

The separately controlled rehearsal requires explicit authorization. A synthetic alert must originate through the configured native Datadog webhook and reach Slack; a message injected into Slack does not prove the trigger or filters. Follow the automation checklist for expected artifacts at triage and each button, both button orders, replay, concurrent clicks, recovery and a new episode, cross-links, failure reporting and cleanup. Do not run it as part of preflight. Provisioning, deployment and image publication belong to Phase 2 and require their own approval.

<!-- /coderabbit-ai-generated:v1 -->
