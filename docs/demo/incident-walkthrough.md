# DeskDrop incident demo: Do / Say / See

Use this as the presentation script, one stage at a time. **Do** contains the exact operator action or link; **Say** is the spoken talk track; **See** is the audience-visible evidence. Slow down at **WOW**, point out **SECURITY** when it matters, and follow the **DON'T DO THIS** callouts. Allow 12–15 minutes for the local incident story, plus questions and agent latency.

The current verified story is alert → Slack → two independent choices: create a ticket, or investigate the repository. The automatic fault command is implemented with production arming blocked under [brief 12](../briefs/12-demo-guide-trigger.md); use the documented TEST fallback until effective Alert-only delivery and all live readiness gates are independently verified. An approved source replay has also produced [native PR #23](https://github.com/coderabbit-demo/mmani-shopping-cart/pull/23). Use its native work logs and current review/Verify results as recorded evidence. This required an explicitly approved source fixture and same-thread clarification; a TEST notification or deliberate app stop alone does not establish a source bug.

Opening: “One checkout alert, two choices. I can record the incident for the team, or ask CodeRabbit to investigate the application directly. Neither choice depends on the other. Let's follow the same incident through the evidence.”

## Before the audience arrives

Open the storefront (`http://localhost:3177/`), [Datadog checkout monitor](https://us3.datadoghq.com/monitors/29524290), [Slack channel](https://app.slack.com/client/T0AU433PG75/C0CEPB2LURY), [native automation](https://app.coderabbit.ai/automations/ui-c0ddcf9b-c9cb-4ae9-b52f-37e164997203), and [repository](https://github.com/coderabbit-demo/mmani-shopping-cart). Keep [SC-41](https://coderabbit-demo.atlassian.net/browse/SC-41) and the [recorded successful thread](https://coderabbitdemo.slack.com/archives/C0CEPB2LURY/p1793917939713579) as clearly identified fallback evidence. For source remediation, open [native PR #23](https://github.com/coderabbit-demo/mmani-shopping-cart/pull/23) and its linked work logs. For a fresh coding demonstration, prepare newly named approved fault/fix refs at seed `ee9cf971da0ecfd1e56f026a74d5b3dff077c5d0`; the existing fix branch is already corrected and must not be reset.

Run the [setup/readiness checks](local-setup.md#pre-demo-checks), confirm the correct workspace and scope, and decide whether the session permits a new Bug and an investigation. For a real-fault run, also verify effective Alert-only routing; the currently inspected tag-only rule does not prove that boundary. A fresh alert cycle is a new episode. Do not click either button just to prepare the browser. If Agent health or the controller is blocked, use the verified TEST route and say it is a notification test; do not present a real-fault rehearsal as ready.

## Stage 1 — Establish the application and the incident


| Step | Do | Say | See |
| --- | --- | --- | --- |
| 1 · Set the baseline | Open the app. In a fresh synthetic session, show a $68 lamp and $32 organizer, DESK15, and $12 express delivery. If readiness is blocked, show the recorded baseline and label it historical. | “This is DeskDrop, our demo storefront. The expected basket is $100, less $15, plus $12 express: $97. We know what a healthy checkout should do.” | The application and expected totals, or explicitly dated recorded evidence. No customer data. |
| 2 · Show the ownership boundary | Open monitor 29524290 and its query, then the automation's destination/scope. | “This monitor is restricted to our local demo identity. It routes into CodeRabbit Demo, in this channel, with access to this repository.” | `service:deskdrop`, `env:local-demo`, the demo/host identity, `mmani-shopping-cart` scope and intended Slack channel. |
| 3 · Start a controlled incident | With the implemented complete effective-route proof guard, after separately approved live routing/controller readiness and window validation, run `bash scripts/demo/trigger-alert.sh plan`, then `run --execute`. Until then, use Datadog **Edit → Test Notifications → Alert → Run Test**, once; close and Cancel. | Automatic: “I’m deliberately stopping only the demo app for a bounded window. Monitoring stays running, and the controller restores the app and suppression.” TEST fallback: “I’m sending a Datadog TEST notification. This proves routing, not an application outage.” | Automatic: a ready plan only after the pinned Alert-only rule, all matching rules in a complete scan and every readiness guard pass, then an observed fresh Alert. Today's plain-recipient live rule and unhealthy runtime do not pass. Fallback: a Datadog event whose title includes TEST. |
| 4 · Follow the same event | Capture the fresh Datadog event/cycle and open the new Slack root, not an older thread. | “This message originated in Datadog and came through the native automation. The event ID identifies this event; the alert-cycle key identifies the incident episode.” | Matching monitor/time/identity, new Slack permalink and actual provider cycle. The navigation window is not an outage-duration measurement. |


**SECURITY:** keep credential files, authenticated webhook values, headers and provider setup secrets off screen. The trigger must not call CodeRabbit directly and pretend that proves Datadog delivery.

**DON'T DO THIS:** do not use all-monitor notification enablement, disable suppression globally, change unrelated containers, or inject a fake Slack message to stand in for the Datadog hop. Do not describe a deliberate app stop as a confirmed application-code defect.

## Stage 2 — Let triage expose what is known

| Step | Do | Say | See |
| --- | --- | --- | --- |
| 5 · Read the first triage reply | Wait for CodeRabbit's reply and inspect the native work log if needed. | “The first run is triage. It separates accepted event facts from unknown runtime impact. It has not created a ticket or started a code change.” | Scope/repository loaded, monitor and episode identity, TEST versus real-fault language, evidence links and stated unknowns. |
| 6 · Pause on the two controls | Point to **Create Jira Ticket** and **Debug and Create PR**. | “These are independent paths. I can use either first or use only one. Debug goes directly to the repository; it does not require or update a Jira ticket.” | Two clickable native buttons on the first triage reply. No literal JSON block or copied button prompts. |

**WOW:** pause here. The operator decides which work to authorize; receiving an alert alone does not launch a coding task.

If native Datadog re-query returns 401, say: “The accepted webhook still supplies the incident identity. Additional Datadog API evidence is unavailable.” Do not claim all provider authentication is healthy or that this blocks the independent Jira action.

## Stage 3 — Debug directly, before creating a ticket

| Step | Do | Say | See |
| --- | --- | --- | --- |
| 7 · Select Debug | Click **Debug and Create PR** once. Do not click Jira first for this version of the walkthrough. | “I want the agent to investigate this application directly. It will inspect the actual branch, rules, source and tests, then try to reproduce the behavior.” | A same-thread acknowledgement and a native follow-up under the repository scope. No ticket prerequisite. |
| 8 · Show the investigation | Open the native work log. For the approved source fixture, show the exact faulty base, plan and two ALLOW paths before implementation. | “A source fix needs a reproduced defect. This isolated fixture charges $24 for express, making the expected $97 basket cost $109. CodeRabbit can reproduce that in the repository.” | A failing assertion and identified source. The earlier healthy-main run passed 68 domain/three browser tests and correctly produced no fix; the later seed replay failed three rule-4 tests. |
| 8a · Follow native authoring | Show the [native commit result](https://coderabbitdemo.slack.com/archives/C0CEPB2LURY/p1793931380343989?thread_ts=1793917939.713579). | “CodeRabbit makes the correction using its native repository tools. It does not need CLI login or a separate cloud-task handoff to code.” | Commit `4d73cba`, exactly two files, the shipping correction and new observable $97 regression; no Jira association. |
| 8b · Review and publish | Show the one CLI review receipt, then [native PR publication](https://coderabbitdemo.slack.com/archives/C0CEPB2LURY/p1793931961332329?thread_ts=1793917939.713579) and its current review/QA receipts. | “The Mac performs the required single CLI review. After that check, CodeRabbit opens the isolated PR. PR feedback and native Verify test the final commit before we call it ready.” | Zero CLI findings; 459 Mac units, 29 goldens and 18 checkout cases; unmerged PR #23, followed by actual exact-head PR/security/CI and native Verify results. |

The early [healthy-main Debug result](https://coderabbitdemo.slack.com/archives/C0CEPB2LURY/p1793918195166449?thread_ts=1793917939.713579) remains a valid no-defect outcome. The evening source replay used the same incident thread, a newly approved faulty base and native authoring after the CLI/task handoff requirement was corrected. The saved policy now makes that distinction explicit. Do not describe the recorded replay as a fresh single-click test of the final policy.

**DON'T DO THIS:** do not turn the absence of a reproduced bug into a cosmetic fix PR. Do not describe the earlier Mac-launched shipping fix as a native button-created PR. Sandbox tests do not establish Mac/Docker recovery.

## Stage 4 — Record the incident independently

| Step | Do | Say | See |
| --- | --- | --- | --- |
| 9 · Select Jira | On the same episode, click **Create Jira Ticket** once when a Bug write is authorized. | “Now I’ll record the incident for the team. This action discovers the fields, searches for an existing incident and creates or reuses one Bug. It does not start repository work.” | Schema lookup, episode/thread deduplication search, then a verified issue link or a specific blocker. |
| 10 · Verify the evidence | Open the returned issue. For the recorded example, open SC-41. | “The ticket carries the accepted monitor, cycle, event and Slack link. TEST and unknown impact are explicit, so the artifact does not invent an outage.” | An SC Bug with synthetic TEST label and matching evidence. SC-41 is the single recorded Bug for cycle `8886137430985137706`, created after Debug finished. |

**WOW:** point back to the Debug timestamp, then the ticket creation time. The investigation already completed before this issue existed. Do not start Debug from the Jira bot to demonstrate this path; that would be a different workflow.


## Stage 5 — Recover and close with the boundary of proof

| Step | Do | Say | See |
| --- | --- | --- | --- |
| 11 · Verify recovery | For the automatic path, inspect trigger `status`, the app/controller, Agent health and the restored checkout suppression. Use explicit `recover --execute` after an interrupted run; unknown outcomes remain fenced. For TEST, leave monitor configuration and mutes intact. | “The demo finishes with the app recovered and notifications back under operator control. A recovery claim needs fresh observations.” | The owned app running, successful fresh checks, verified suppressions and sanitized receipt with confirmed reservation release. Check `alertObserved` separately: `no-alert-observed-restored` is cleanup without an Alert, not alert delivery. An expired receipt receives a new bounded recovery attempt, never another fault. For a TEST-only session, no claim of a real fault/recovery. |
| 12 · Close the story | Show the two Slack outcomes and the [GCP handoff](gcp-team-handoff.md). | “We followed one incident into two independent operator choices. Ticket creation and direct repository investigation are demonstrated. Native source authoring and PR publication are also recorded in PR #23; its exact-head review and Verify receipts show the verified result. A real runtime alert and recovery remain separate operator evidence. Next, the runtime moves to GCP so the team can use it without my Mac.” | Clear separation of demonstrated behavior, remaining fix-PR work and the next deployment phase. |


## Optional extension — Run a fresh source-fix rehearsal

For a fresh coding presentation, approve a reproducible isolated source fixture and exact ALLOW paths, create and read back fresh fault/fix refs, and retain a known faulty base plus a failing assertion. Keep native work-log, branch, commits and PR metadata free of Jira identifiers. Use the required raw associated GitHub issue URL for PR metadata; it does not create a Jira dependency. Never reset the existing corrected branch or present its old source as a new failure.

| Do | Say | See |
| --- | --- | --- |
| Tag the installed CodeRabbit app in the current incident thread and supply the approved repo/base/refs, two-file scope, minimal fix/regression plan and native-authoring grant. Click Debug once when authorized. | “This time we have an approved source regression. The agent works directly in the repository, within these paths.” | Native work-log, actual source identity and reproduced failure. No separate cloud-task or authoring CLI login requirement. |
| After the native committed patch, run exactly one Mac CLI review, record findings and provide the publication go-ahead in the same thread, tagged to CodeRabbit. | “Coding and review are separate steps. The authoring agent returns a patch; the Mac performs the one CLI review before publication.” | Reviewed base/head and completed review receipt; native unmerged PR against the faulty branch. |
| Run CodeRabbit PR feedback/security/CI and a dedicated native QA journey pinned to the final head. For a non-default PR base, explicitly request `@coderabbitai review` if automatic review is skipped. | “Verify tests this exact revision, including the $97 checkout, receipt and history.” | Conclusive current-head PR/security/CI and native Verify evidence; the PR stays unmerged. |

The recorded PR #23 rehearsal demonstrates this flow with same-thread clarification. Its native authoring run is the task evidence; a separate cloud Coding Agent task was not created. Show a specific native repository/PR permission failure if one occurs; do not copy CLI credentials into the agent or substitute a harness-authored patch and label it native.

## Fallback and reset card

- No fresh Slack thread: inspect the existing Datadog event and automation run history before sending again. Avoid blind duplicate triggers.
- Prepare conflict: inspect the run history for the actual error; the repaired duplicate-Atlassian scope problem is documented in the provider runbook.
- Literal button JSON: use the saved concise native definitions; the 2:32 PM run proved rendering after that change. Do not present raw JSON as controls.
- Jira button returns a link: open that exact issue. Reuse only for the same accepted episode. A new cycle is a new incident, not permission to reuse SC-41.
- Unknown write/dispatch result: stop that action and inspect before retrying. No concurrent/replay guarantee was proved by the recorded one-click tests.
- Runtime not healthy: use the explicitly labelled TEST/recorded route rather than opening a real-fault notification window.

Retain episode links and existing artifacts. Reset synthetic shopper state with a fresh context or `/demo`; keep credentials, ownership journals and previous receipts. Leave any fix PR unmerged unless separately authorized.
