<!-- coderabbit-ai-generated:v1 -->

# Datadog to Slack Automation - MMANI

## Operator preparation

These are reviewable instructions for the existing [automation](https://app.coderabbit.ai/automations/ui-c0ddcf9b-c9cb-4ae9-b52f-37e164997203). As last reported it is active, sends to a saved CodeRabbit DM, allows a PR during initial triage and has no runs. It must be deliberately aligned before rehearsal. This document does not authorize changing it or sending an event.

An authorized operator should review its trigger, destination, Agent scope, connections, author identity, budget and failure reporting. Select CodeRabbit Demo workspace `T0AU433PG75` and `#mmani-shopping-cart` (`C0CEPB2LURY`); verify actual channel membership and access to this repository, US3 Datadog and Jira SC. The webhook wizard supplies an authenticated endpoint and required header. Keep both out of examples, logs, repository files and evidence. Its `monitor.alert` and `incident.triggered` event filters are CodeRabbit event types, not Datadog `$EVENT_TYPE` substitutions.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d6cd96bfa8e686b07a28694aa15109c4a041fe8e3060fc13241a00f9c9d27a54 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e93243393db72bee5982418e382cb534af34749243737ebc76f435c6707716bb -->

## Proposed local scope

The proposed local scope is `service:deskdrop`, `env:local-demo`, `demo_id:mmani-shopping-cart-local` and host `deskdrop-mmani-local`. The monitors are `[MMANI local] DeskDrop availability`, `[MMANI local] DeskDrop checkout` and `[MMANI local] DeskDrop checker heartbeat`. Proposed failure classes are `http_unavailable`, `journey_failed` and missing checker data. The local diagnostics include source commit and local image identity as separate sanitized evidence; a local image ID does not establish registry publication.

The existing destination remains CodeRabbit Demo workspace `T0AU433PG75`, channel `C0CEPB2LURY`. Native event fields, filter enforcement, representative payloads and matching/unrelated-event tests remain pending actual evidence and separate approval. Do not infer that a diagnostic failure class is automatically present in the native Datadog webhook payload. Initial triage remains button-gated as described below; the existing reuse, concurrency and failure-reporting requirements remain unchanged.

## Scope record required before activation

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:016c7d191dac1285d1a939d9760ef2d2601931f0ed07f094decd467758b3e0e0 -->

The confirmed native trigger event types are `monitor.alert` and `incident.triggered`. The intended cases are DeskDrop availability, the cart journey and missing checker data in the [parent issue's monitoring contract](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10). The local runtime tags above are approved scope; native payload mappings and filter enforcement remain unverified. GCP deployment tags are not approved or configured by this document.

<!-- /coderabbit-ai-generated:v1 -->

Before activation, the authorized operator must maintain an authoritative, reviewed scope record identifying the exact service and environment values, each permitted failure class and native event type, the actual payload field paths and values used to match them, and the filter configuration and its enforcement capability. Record sanitized representative deployed payload evidence for every case, test results for matching and unrelated events, the approver, approval date and evidence links. Mark each item proposed, verified or pending decision. Do not record webhook credentials. If any value, mapping, approval or evidence is missing, block activation and rehearsal until the record is complete. If native filters cannot enforce the recorded scope, record the gap and block activation; instructions to ignore events are not a trigger filter or access boundary.

[CodeRabbit automation documentation](https://docs.coderabbit.ai/slack-agent/automations) describes native buttons and a one-minute webhook delivery deduplication window. Neither establishes atomic serialization of ticket, task and PR creation.

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a1811b369b4ac9dbd3813a0c6f41a3b8903bef1702b3ee17976dc60ff979b6e1 -->

## Proposed Agent instructions

After separate authorization and review, the operator must REPLACE the complete saved instruction set with the reviewed block below, using the completed scope record. Remove the existing initial-triage PR permission. Never append this block to conflicting saved instructions. Verify the complete saved instructions before activation.

> Process only the service, environment, failure classes and native event types in the approved scope record, using its verified payload field mappings. Ignore unrelated events and report missing or ambiguous identity without taking action. Summarize impact, monitor, deployment revision, diagnostic evidence and links in the incident thread. Initial execution is triage only: do not create a Jira ticket, start a CodeRabbit coding task or open a PR. Add two independent buttons on the initial reply:
>
> **Create Jira Ticket:** create or reuse an SC Bug for this incident. Include impact, reproduction, expected and actual behavior, sanitized Datadog evidence, deployed commit and image digest, and Slack permalink. Reply with status and the ticket link.
>
> **Debug and Create PR:** investigate the incident, create or reuse the same SC Bug, and hand CodeRabbit Code the evidence, faulty isolated demo branch and commit, reproduction, approved ALLOW scope and acceptance criteria. Reply with diagnosis, task status, tests and PR link. Report permission errors, timeouts and budget exhaustion in the thread.
>
> Use a durable incident key derived from monitor, environment and failure episode. Reuse the associated ticket, task and PR across webhook retries and either button order; a new episode after recovery gets a new identity. Do not start duplicate work. Do not claim atomic reuse unless the platform actually guarantees it. Keep fault seeds and fixes on isolated demo branches; target the faulty branch for remediation. Do not merge, deploy, apply Terraform, access VM administrative credentials, bypass gates or alter goldens.
>
> For each new coding task, require one completed CodeRabbit CLI review before task completion or PR publication. An in-task completed review counts; a Mac fallback is needed only when no review completed. PR-fix tasks and rounds are exempt. Record task ID, reviewed commit/base, completion and finding dispositions. Require exact-head CodeRabbit PR review and security gates, deterministic tests, and CodeRabbit QA Agent Verify evidence. Report unsupported, failed, stale or inconclusive outcomes as such.

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f4dc528073161c42129b847d786f735346de382880deb7579895f7384f13212a -->

## Capability proof and controlled rehearsal

Before rehearsal, record separate evidence for each capability, the acting identity, target, date and outcome. Connection badges, read access and effective Agent scope are separate prerequisites and do not prove any write capability. Inspect permissions where possible; any write probe requires its own authorization and disposable targets. Preparing this document performs no service write or capability check.

- **Slack channel writes:** verify the automation's effective identity can post and reply in `#mmani-shopping-cart`; retain a permitted channel message/thread link or equivalent definitive capability evidence.
- **Jira SC Bug creation:** verify that identity can create and link an SC issue of type Bug; retain a disposable issue link or equivalent definitive capability evidence. SC read access alone is insufficient.
- **CodeRabbit task and GitHub PR creation:** verify the effective identity can create a task for this repository and that the task's authorized GitHub identity can create a PR against the isolated demo branch; retain task and PR links or equivalent definitive capability evidence. Repository listing alone is insufficient.

Review the saved instructions, destination, scope record, native filters and button support before activation. The rehearsal itself requires separate explicit authorization. The synthetic alert must originate through the configured native Datadog webhook and then reach the selected Slack channel; injecting a Slack message does not test the trigger or filters. Capture sanitized event and episode identity, delivery and thread links, issue/task/PR identities and links, and exact tested revisions. Exercise matching and unrelated events against the scope record.

| Case | Observable expected artifacts |
| --- | --- |
| Initial triage | One incident thread with both buttons and diagnostic status; no Jira ticket, CodeRabbit task or PR. |
| Create Jira Ticket alone | One SC Bug created or reused and linked in the thread; no task or PR. |
| Debug and Create PR alone | One SC Bug, one CodeRabbit task and one PR created or reused; the thread links all three. |
| Ticket then Debug | The second action reuses the same SC Bug and creates or reuses one task and one PR; both replies identify the same ticket. |
| Debug then Ticket | The second action reuses the same SC Bug; one task and one PR remain, and both replies identify the same ticket. |
| Webhook replay with no button | Assert that the existing triage incident and thread are reused under a proven platform contract and that no ticket, task or PR is created. If reuse is unproven, record the gap and stop rather than claim a pass. |
| Repeated or concurrent Create Jira Ticket only | In an episode with no Debug selection, observe at most one SC Bug and zero tasks or PRs; successful responses reuse the same ticket link. |
| Repeated or concurrent Debug and mixed-button selections | Observe exactly one shared SC Bug and at most one in-flight task and one in-flight PR. After successful authorized completion, observe exactly one task and one PR; responses show identical links for each shared artifact. Record counts and links for in-flight and final outcomes. |
| Recovery followed by a new failure | Record recovery, then a new episode key and new incident identity; subsequent actions create or reuse artifacts for the new episode without reusing the recovered episode's identities. |

Check that the Slack thread, SC Bug, task and PR cross-link their matching episode and each other, and retain the identities and links. Test permission failures, timeouts and budget exhaustion for visible status without claiming success. Prompt-only searches do not serialize concurrent actions; do not claim native atomicity without evidence. If replay or concurrent-click evidence is missing or safe reuse fails, report the integration gap and stop further rehearsal pending an approved bounded solution. Failed, unsupported or inconclusive behavior is not a pass.

After an authorized rehearsal, pause or restore the automation as agreed, close or remove only disposable demo artifacts under the operator's permissions, and record cleanup, residual resources and costs. Never include real incident or customer data in fixtures or reports.

<!-- /coderabbit-ai-generated:v1 -->
