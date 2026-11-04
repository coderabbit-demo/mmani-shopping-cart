<!-- coderabbit-ai-generated:v1 -->

# Datadog to Slack Automation - MMANI

## Operator preparation

These are reviewable instructions for the existing [automation](https://app.coderabbit.ai/automations/ui-c0ddcf9b-c9cb-4ae9-b52f-37e164997203). As last reported it is active, sends to a saved CodeRabbit DM, allows a PR during initial triage and has no runs. It must be deliberately aligned before rehearsal. This document does not authorize changing it or sending an event.

An authorized operator should review its trigger, destination, Agent scope, connections, author identity, budget and failure reporting. Select CodeRabbit Demo workspace `T0AU433PG75` and `#mmani-shopping-cart` (`C0CEPB2LURY`); verify actual channel membership and access to this repository, US3 Datadog and Jira SC. The webhook wizard supplies an authenticated endpoint and required header. Keep both out of examples, logs, repository files and evidence. Its `monitor.alert` and `incident.triggered` event filters are CodeRabbit event types, not Datadog `$EVENT_TYPE` substitutions.

Configure native event type and payload-field filters for the approved demo service, environment and incident types where the platform supports them. Verify filters against actual sanitized payloads. An instruction to ignore unrelated events is not a trigger filter or access boundary; if platform filters cannot enforce the scope, record the gap and do not claim the automation is scoped. [CodeRabbit automation documentation](https://docs.coderabbit.ai/slack-agent/automations) describes native buttons and a one-minute webhook delivery deduplication window. Neither establishes atomic serialization of ticket, task and PR creation.

## Proposed Agent instructions

> Process only the approved DeskDrop demo service and environment and relevant monitor alert or incident trigger. Ignore unrelated events and report missing or ambiguous identity without taking action. Summarize impact, monitor, deployment revision, diagnostic evidence and links in the incident thread. Initial execution is triage only: do not create a Jira ticket, start a CodeRabbit coding task or open a PR. Add two independent buttons on the initial reply:
>
> **Create Jira Ticket:** create or reuse an SC Bug for this incident. Include impact, reproduction, expected and actual behavior, sanitized Datadog evidence, deployed commit and image digest, and Slack permalink. Reply with status and the ticket link.
>
> **Debug and Create PR:** investigate the incident, create or reuse the same SC Bug, and hand CodeRabbit Code the evidence, faulty isolated demo branch and commit, reproduction, approved ALLOW scope and acceptance criteria. Reply with diagnosis, task status, tests and PR link. Report permission errors, timeouts and budget exhaustion in the thread.
>
> Use a durable incident key derived from monitor, environment and failure episode. Reuse the associated ticket, task and PR across webhook retries and either button order; a new episode after recovery gets a new identity. Do not start duplicate work. Do not claim atomic reuse unless the platform actually guarantees it. Keep fault seeds and fixes on isolated demo branches; target the faulty branch for remediation. Do not merge, deploy, apply Terraform, access VM administrative credentials, bypass gates or alter goldens.
>
> For each new coding task, require one completed CodeRabbit CLI review before task completion or PR publication. An in-task completed review counts; a Mac fallback is needed only when no review completed. PR-fix tasks and rounds are exempt. Record task ID, reviewed commit/base, completion and finding dispositions. Require exact-head CodeRabbit PR review and security gates, deterministic tests, and CodeRabbit QA Agent Verify evidence. Report unsupported, failed, stale or inconclusive outcomes as such.

## Capability proof and controlled rehearsal

Before enabling a changed automation, review its saved instructions and verify the platform actually recognizes the two named buttons and the selected destination and filters. Plan a separately authorized synthetic alert through Slack, an SC Bug and a disposable CodeRabbit task/PR. Capture sanitized event identity, delivery/thread links, issue/task/PR links and exact tested revisions. Exercise each button independently, both orders, webhook retries and concurrent repeated clicks; verify one ticket, task and PR per failure episode, and a separate episode after recovery. Test permission failure, timeout and budget exhaustion reporting.

Prompt-only searches do not serialize concurrent actions. If replay or concurrent-click evidence is missing, or the native product cannot guarantee safe reuse, report the integration gap and stop the rehearsal pending an approved bounded solution. Do not invent a remote backend or custom Slack app. Failed, unsupported or inconclusive behavior is not a pass.

After an authorized rehearsal, pause or restore the automation as agreed, close or remove only disposable demo artifacts under the operator's permissions, and record cleanup, residual resources and costs. Never include real incident or customer data in fixtures or reports.
