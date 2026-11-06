# DeskDrop Vercel API workflow — implementation proposal

Status: APPROVED TO PROCEED with the November 6 addendum below. Prepared November 6, 2026. Owner: Mahesh Mani. This document authorizes no implementation, project creation, deployment, integration install, credential transfer, monitor change, message, ticket, PR or purchase. GCP rollback inventory at 15:28 UTC returned zero owned demo candidates; PRs 28–30 are closed unmerged, issues 24–27 are closed as not planned, the never-applied preflight plan is archived as withdrawn, and the checkout is back at `0f0c42fcff214a8b8fbfd5ee5813d79d351dd94c`. No additional GCP permissions are requested. This does not assert a zero final bill.


## Approval addendum - November 6, 2026

Mahesh approved proceeding, chose project `coderabbit-automation-demo` in `coderabbitai`, required paramount API protection, cloud-only runtime and no local dependencies, and requested a Postman-import JSON. This addendum supersedes the draft's pending implementation/team selection and any Mac/curl-script operation. Runtime, build, tests, deployments, monitoring, operational configuration and workflow execution run in managed cloud services. The Mac is an administrative harness only; install no dependency or server locally. Existing management tools may administer the cloud. No new subscription or organization-wide permission change is authorized. Deployment-related usage is limited to the dedicated project and small supervised proof described below; no unattended load or scheduled fault.

Use Vercel Authentication for **all deployments**, including any production alias, before the first deployment. Each authorized presenter uses a separately named, independently revocable project automation bypass secret in Postman's private Vault. Add application-level bearer authentication using server-held SHA-256 token digests (not plaintext keys), expiry and allowlisted actor identity, constant-time comparisons, generic denial and fail-closed missing/malformed configuration. No public health endpoint, query-string token, wildcard CORS, arbitrary URL fetch, body/header/environment logging, stack trace in an API response, or caller-controlled source/actor metadata. Bound token/header/body sizes and validate all inputs. A genuine runtime 500 counts only after authorization; invalid requests/auth failures must not trigger the incident monitor. Per-instance counters do not qualify as a distributed rate limit; prove the actual managed rate limit honors automation bypass requests before claiming it.

Postman collection v2.1 and a secret-free environment JSON are the required operator deliverables. No Node/Bash/npm/Docker/GCP tool is required by a presenter. API controls invoke only fixed quote behavior; there is no endpoint for arbitrary code, provider writes, deploy/merge or fault insertion. Preserve source-pinned, protected healthy/fault/fix previews. API credentials authorize API requests, not downstream Jira/coding actions. Slack's authorized native action remains the separate user decision. Secrets live only in provider-managed settings and approved client secret storage; no new local env files.

Required sequence: CodeRabbit inspects the milestone-1 plan against this approved scope; implement protected/authenticated health API, telemetry, meaningful tests and importable Postman artifacts; complete review/CI/QA; prove actual protected 200 and indexed US3 intake before quote/fault/action implementation. Do not re-prompt for routine choices within this approved scope. A real access/credential blocker must be reported precisely. Merge is still a separate checkpoint.


## Isolated telemetry approval - November 6, 2026

Mahesh confirmed `Personal` in Datadog US3 (`manimahesh1@gmail.com`) is demo-only and explicitly approved isolated logging with a new ingestion key stored only in `coderabbitai/coderabbit-automation-demo`. The shared Vercel Datadog installation serves production `coderabbit-bot`; do not add this project to it, reconnect it, alter its organization/keys/drains/routing, or reuse its credentials. This supersedes the earlier Marketplace/log-drain design. No production Datadog connector is needed for runtime delivery.

Use built-in Node HTTPS fetch to the fixed documented Datadog US3 v2 log-intake endpoint. Read only a new dedicated project-sensitive `WORKFLOW_DD_API_KEY`; no inherited generic DD credential or management key. Enroll it privately after verifying the demo org and key identity. No package, Mac runtime, local env file, redirect, caller-supplied destination, arbitrary proxy, raw request data or retry loop. Await one bounded send within the function lifetime; distinguish transport acceptance from indexed-log proof. Preserve sanitized Vercel stdout events, server-derived source/request/actor identity, request authentication/limits and all prior assertions. Transport failures must not masquerade as a genuine quote defect or successful end-to-end proof.

This is new approved telemetry implementation work, not a PR-fix-only round: complete one additional CLI review for this new behavior, plus exact-head PR/security/CI feedback and native Verify. Existing auth/Postman fixes required no extra review. Scope remains under30 files, zero third-party dependencies.

Exact isolated-telemetry ALLOW subset:

```text
ALLOW: tools/workflow-api/lib/datadog.mjs
ALLOW: tools/workflow-api/lib/telemetry.mjs
ALLOW: tools/workflow-api/api/health.mjs
ALLOW: tests/workflow-api-datadog.test.mjs
ALLOW: tests/workflow-api-http.test.mjs
ALLOW: docs/briefs/16-vercel-api-workflow.md
ALLOW: docs/demo/vercel-api-walkthrough.md
```

The first real protected200 must join to searchable logs in Personal US3 before quote/fault/action implementation. API authentication, old-preview revocation/retirement and source/credential isolation must be demonstrated separately. No quote fault, new monitor activation, Jira Bug, Debug fixPR, merge, production action or live alert in this telemetry coding task.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:25d6c6a5d1f1f6765e0a09b4cad2ae59b0fdd7cebf071423795ceb314eb7dbf3 -->

## Isolated transport implementation contract

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:60d1004d6d34bf6934e3649323d03fc290de548943dd3199a45433a4b69d3217 -->

The isolated approval supersedes the historical Marketplace/drain and no-network instructions: runtime uses only dedicated project-sensitive WORKFLOW_DD_API_KEY and fixed US3 HTTPS. Require a dedicated demo-only key with approved restricted capabilities, enrolled privately as sensitive Preview-only project configuration. No credential value or provider operation is part of source implementation.

Provider status, November 6, 2026 (harness-reported): the user approved disabling Remote Config/PAR on Personal US3 key `6b285b10-cca4-462c-95c7-7a2ac2299d14`; both are disabled and independently UI-verified. The key was privately enrolled as sensitive WORKFLOW_DD_API_KEY, Preview only, variable ID `2SDRoqAfxQyEGiAZ`. No value was supplied to source authoring. There are no application-actor or bypass credentials, deployments or live API requests. Automatic approval review blocked the live probe pending explicit live authorization; a concrete authorization package is being prepared. Protected-200 and indexed-intake acceptance remains incomplete.

<!-- /coderabbit-ai-generated:v1 -->

Health retains auth, input/source validation and sanitized stdout. It awaits one bounded submission before source-matching 200. Expected configuration or transport failure returns generic 503; genuine unexpected application exceptions retain generic 500. Denied/invalid requests never send and this task emits no quote_failed. Only intake 200/202 acknowledges submission, not indexing. The two-second whole-attempt deadline includes response cleanup even if fetch ignores abort. Unknown event/source attributes and fixed service/site overrides fail closed.

Cloud tests use explicit synthetic fetch/clock fixtures on Node 22 and 24, without default mock successes or provider calls. See docs/demo/vercel-api-walkthrough.md for onboarding, source pins and immutable-preview retirement. Protected 200 plus matching indexed Personal US3 logs, trusted provider readback, PR/security/CI and native Verify remain independent required gates. No quote/fault/action implementation proceeds before the live gate.

## Proposed outcome and smallest architecture

<!-- /coderabbit-ai-generated:v1 -->

Use the existing `coderabbit-demo/mmani-shopping-cart` repository and its working native CodeRabbit scope. Add a separate, small `tools/workflow-api` Vercel project root. It exposes a protected health endpoint and a genuine quote-calculation API callable from Postman or a bounded curl script. The shopper application, its localStorage behavior, all six existing cart requirements, goldens, root npm manifest and root lockfile remain untouched.

Proposed chain:

`Postman/curl → protected Vercel Preview Function → actual runtime error log → Datadog US3 COUNT monitor → existing MMANI automation → CodeRabbit Demo/#mmani-shopping-cart → two independent native actions`

The actions are **Create Jira Ticket** for the incident episode, or **Debug and Create PR** for direct repository reproduction and a minimal fix. Debug must not create, read, reference, attach or require Jira. Use two separate Alert episodes to prove independence: episode A exercises Jira only; episode B exercises Debug first, without a Jira ticket. Replaying either action in its original episode must not duplicate its artifact. No browser check, Synthetics, VM, Docker, systemd, Datadog Agent or public Mac receiver is needed.

Native Node.js Functions support `.mjs` and Web Request/Response handlers. Select Node `24.x` explicitly in the standalone manifest/project; Vercel currently supports that major and manages its patch/minor runtime updates. Record the actual runtime version after deployment. This needs no new third-party dependency. An existing Next.js API route would also work, but would couple the API deployment to the shopper project and its build; the isolated project root is the smaller boundary here. [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js), [supported versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Current evidence and decisions still needed

The harness reported Vercel CLI 58 authenticated as `mahesh-7253`, active Owner membership in `CR-DEMO` (`cr-demo`, Hobby), and active Member membership in `coderabbitai` (Enterprise). These account observations are not proof that project import, Git organization policy, integration installation or US3 intake will work.

Propose a new project named `coderabbit-automation-demo` in the existing `coderabbitai` Enterprise team, with Root Directory `tools/workflow-api`, **if Mahesh approves and its policies permit this demo**. Project-name availability is pending. Standard Member capabilities include project/deployment and integration management, but actual team/project restrictions must be checked. Drains require Pro or Enterprise. `CR-DEMO` Hobby would require a paid upgrade; current Pro base pricing is $20/month plus applicable usage. No upgrade, purchase or payment change is approved. [Access roles](https://vercel.com/docs/rbac/access-roles), [Drains](https://vercel.com/docs/drains/using-drains), [pricing](https://vercel.com/pricing).

Approval must name:

- Team and new project name/root; permission to import the existing Git repository and deploy isolated Preview branches. Production/default-branch promotion stays excluded.
- Incremental Vercel and Datadog usage allowance and monitoring period. The old GCP $100 allowance and expired live window do not carry over. Coding-agent time/cost remains uncapped under Mahesh's preference.
- A new supervised live window and counts. Suggested envelope **for approval, not yet authorized**: one 90-minute session after readiness, at most 30 live API requests, two fresh Alert episodes, one incident Bug, one isolated fix PR and up to six Preview deployments. Automatic Git deployments count toward that envelope.
- Permission for the selected-project Datadog integration/drain, dedicated ingestion credential and any integration-managed environment variables; one new COUNT monitor and a narrowly pinned MMANI identity update.
- Mahesh as initial presenter, a second presenter still to be named for team-readiness acceptance, and a private protected-URL header path for Postman and native QA. Any broader access must be explicitly included in approval.

## Prerequisites and private inputs

| Boundary | Required capability or input | Acceptance evidence before proceeding |
| --- | --- | --- |
| Vercel | Chosen paid-capable team; project/Git import, deploy, environment/protection and integration rights; organization policy approval | Actual selected team/project IDs, imported repository/root and protected Preview deployment readback |
| Datadog US3 | Log Management ingestion/index access; install/configure integration permission; monitor read/write; authorized selected-project ingestion key | Data appears in the intended US3 organization, is searchable/indexed and maps to the actual Vercel deployment/request |
| Protection | Protected Preview URL and a revocable project automation bypass secret, shared privately with approved callers | Without the header, request is denied; authorized header reaches the function. No public or unprotected fallback |
| CodeRabbit | Existing repository scope, native MMANI connection, direct repository authoring and exact-head PR/Verify access | Current actual repository/scope identity and capability check; native authoring has no CLI-login prerequisite |
| Slack/Jira | Existing CodeRabbit Demo workspace and `#mmani-shopping-cart`; SC Bug create/search/read capability | Correct channel/workspace and issue schema/permissions; previous results are historical, not fresh authentication proof |
| Operator tools | Node 24, Bash/curl and Postman Desktop or another approved client; private local secret variables; no synced/exported credentials | Node 24.13.0 is present; confirm Postman/client availability and run a nonsecret collection import before live rehearsal |
| QA environment | Native CodeRabbit Verify configured for the standalone API root and its tests; approved private runtime access if live URLs are used | Reproduce the API contract in the actual QA environment; report source-only and live-deployment results separately |
| Rehearsal | Approved fault/fix branches, exact source/deployment pins, sanitized quote input, live window and limits | Recorded readiness and approval before the first intentional failing request or notification routing is enabled |

Use Vercel's documented `x-vercel-protection-bypass` **header**, kept in private local/QA secret storage. It is project-wide access to protected deployments until revoked; never put it in URLs, exported Postman examples, Slack, Jira, screenshots, briefs or logs. Prefer separate operator/QA secrets when supported. [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

No Datadog application/management key belongs in the Function. Use `VERCEL_PROTECTION_BYPASS` only as a private operator/QA variable, and `DEMO_BASE_URL` / `DEMO_RUN_ID` for nonsecret configuration. `DD_SITE=us3.datadoghq.com` names the intended Datadog site; actual integration readback and intake must confirm it. `DD_APP_KEY` remains management-only outside the runtime. The official Marketplace integration may automatically manage `DD_API_KEY` and `DD_SITE` on selected projects; its actual installation behavior and credential scope must be reviewed in milestone 1. Use a dedicated approved ingestion key, not an implicit copy of the Mac environment. Keys, integration URLs and bypass values stay out of this plan and the repository.

## Milestone 1 — prove protected connectivity and real US3 intake first

1. After approval, CodeRabbit proposes then implements only the minimal isolated project, `GET /api/health`, structured telemetry and observable tests. It returns 200 with nonsecret request/source identity and emits one bounded info event. Complete its single CLI review and required PR/native QA feedback.
2. Create only the approved empty project, configure Root Directory and deployment protection before the first deployment, then deploy a protected healthy Preview. Avoid an import flow that automatically deploys main/production; verify the first-deploy and Git auto-deploy behavior before attaching the repository. Use an explicit team/project on every deployment command. Verify denial without authorization, authorized 200, no-cache behavior and exact source/deployment metadata. No faulty source or incident monitor is armed in this milestone.
3. Configure the official Datadog Marketplace integration for **this project only**, **Lambda/runtime logs**, **Preview only**, **100% sampling**. Keep trace/APM, build/static/firewall sources and other projects excluded unless separately justified. Inspect the actual US3 destination and integration-managed settings. Vercel's generic Datadog destination in the current Drains documentation is for **Audit Log** data; it is not the runtime-log route intended here. [Datadog Vercel setup](https://docs.datadoghq.com/integrations/vercel/), [Drains configuration](https://vercel.com/docs/drains/using-drains).
4. Invoke the real protected health endpoint and independently find that exact request in Vercel Runtime Logs and indexed Datadog US3 logs. Preserve sanitized timestamps, project/environment/deployment/source and request IDs, event content and actual field mappings. Confirm index exclusions/sampling/quotas do not discard this demo's matching logs.

**Mandatory stop gate:** protected API 200 **and real matching Datadog US3 log intake** must both be observed before full quote/fault/action workflow coding. A drain installation screen, platform Test event, local stdout or a mocked SDK test does not satisfy this gate. If the selected team's permissions, integration or US3 connection fails, report the concrete blocker and wait; do not buy a plan, switch organization or expand scope silently.

## Milestone 2 — genuine error, real alert and independent actions

### Healthy contract and isolated source defect

The initial healthy API feature PR is reviewed and remains unmerged until a separate merge approval. Rehearsal branches may be based on its exact approved, reviewed head. Deliberate fixture changes are never merged into main. No automatic post-merge workflow is triggered by this plan.

Implement `POST /api/quote` with synthetic product codes/quantities, `delivery: "standard" | "express"` and optional `DESK15`. Use integer cents, free standard or $12 express delivery, and DESK15 at a $100+ subtotal with an explicit reason when ineligible. The proposed example is lamp $68 plus organizer $32: subtotal $100, discount $15, express $12, total **$97**. Invalid JSON, unknown products, invalid quantities/delivery or oversized bodies return bounded 4xx responses and are not counted as application faults.

Preserve a known healthy source and immutable Preview URL. In a newly named isolated fault branch, CodeRabbit seeds a reviewed regression in the real delivery lookup: compare canonical lowercase delivery codes against an incorrectly uppercased request value. A valid `"express"` quote then fails to find its delivery row and dereferences the missing fee, producing a genuine calculation TypeError and HTTP 500 through the ordinary error boundary. Preserve every healthy assertion: the valid express quote tests must become red on the seed. Record this expected fixture failure openly; do not delete, skip or weaken assertions or label the deliberately faulty fixture green. The seed is an explicitly approved isolated rehearsal branch, outside the healthy feature PR merge gate. This is a deliberately introduced source defect for the demo, not an actual customer outage. Do not implement a failure flag, artificial throw endpoint or error-only test route and present it as a discovered code bug.

Debug must reproduce that same valid input on the pinned faulty source, correct the lookup and add/preserve its observable $97 regression. Its PR targets the **isolated faulty branch**, remains unmerged, and never targets healthy main/default. Use a new fix Preview for verified 200 behavior; do not mutate a previously captured deployment identity.

### Logs, monitor and authoritative episode identity

Emit one sanitized JSON error event through the normal error boundary: stable event name `quote_failed`, error class/code, bounded code-location information, HTTP status, server-generated request ID, operator correlation ID if supplied/validated, and deployment/source metadata. Never record authorization headers, cookies, tokens, full environment, arbitrary request body or customer data. Client-provided run IDs are correlation labels, not authority for source, actor or episode identity.

Read deployment/project/environment/Git identity from Vercel system metadata and corroborate it with provider deployment readback. Do not accept those fields from the request. `VERCEL_DEPLOYMENT_ID` and `VERCEL_GIT_COMMIT_SHA` are documented platform variables; missing/unverified source metadata blocks source-claim readiness. Vercel runtime logs group output by request and expose request/status details; actual Datadog nested/envelope fields must come from milestone 1, not guessed attribute names. [System variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Runtime Logs](https://vercel.com/docs/logs/runtime).

Create one new owned log **COUNT** monitor with an explicitly recorded rolling window, proposed five minutes, alerting at **count >= 1** for the exact approved project/environment/demo identity and genuine `quote_failed` 500 events. Bind any JSON parsing/index rule to the selected source only. Use a narrow source/deployment allowlist and deduplicate request IDs when displaying evidence; do not assume log delivery is exactly once. Final executable query must use observed fields and pass Datadog validation/readback. Count monitors can evaluate empty windows as zero under the appropriate missing-data configuration; verify that actual option and outcome. [Log monitors](https://docs.datadoghq.com/monitors/types/log/?lang_pref=en), [missing-data behavior](https://docs.datadoghq.com/monitors/guide/on_missing_data/?lang_pref=en).

The existing MMANI configuration is pinned to local monitor IDs/tags. The proposed approval must permit adding and reading back **only** the new monitor identity and new Vercel tags; preserve the local route and mutes. No all-monitor routing or global suppression change. Trusted webhook monitor ID plus Datadog alert-cycle/event identity forms the episode; a client run ID does not replace it. Supply actual log/deployment links and the approved source/branch/input context in the native thread without embedding secrets. Action instructions must invoke CodeRabbit with its supported Slack mention when asking it to act, and render actual native controls rather than printing button JSON. Jira instructions must not launch coding; Debug instructions must not call or reference Jira. Verify native field mapping instead of assuming it.

In episode A, issue one bounded genuine failing request, observe indexed error → Datadog Alert → fresh MMANI thread and actual controls, then exercise Jira only. Verify the SC Bug and replay deduplication; no Debug run or PR may be created. Wait for the actual monitor to return OK before starting episode B. In episode B, issue another bounded failing request and exercise Debug first with no Jira issue or reference for that episode. Reproduce and fix directly, verify the unmerged fix PR and replay deduplication; no Jira operation may run. Both source-change plans and the single Bug write require the approved rehearsal scope. Do not manufacture a replacement Slack alert or manually create a ticket/PR and call that native proof.

### Acceptance and recovery

- Valid healthy and fixed quote inputs return 200/$97; faulty source returns 500 for the same valid express input. Preserved tests fail on the seed and pass on the fix.
- Real request/deployment/source identity joins Vercel logs, Datadog US3 indexed logs, monitor transition and Slack thread. Capture actual latencies; do not promise a delivery SLA.
- Native Debug creates the minimal isolated fix PR without Jira references or prerequisites. One episode-A Bug is created/reused by Jira only; episode B has no Jira artifact or Jira dependency. Each button replay is audited for no duplicate task, issue or PR. Preserve current native action limitations honestly.
- Observe monitor recovery **after its actual error window rolls off** and record the transition. Stopping requests is not a software fix. Fixed Preview 200 plus regression tests proves the source correction; a quiet error counter alone does not prove availability or functioning intake.
- Each new coding task, including a separate seed or native fix task, receives exactly one completed CodeRabbit CLI review. PR-fix rounds need no extra CLI run. Require exact-head CodeRabbit PR/security/CI feedback and native QA Agent Verify; preserve all criteria. Prove protected API access privately or report that gate pending; offline QA is not a substitute for actual deployment/log intake.

## Proposed exact file scope — 17 paths, approval pending

```text
ALLOW: tools/workflow-api/package.json
ALLOW: tools/workflow-api/package-lock.json
ALLOW: tools/workflow-api/vercel.json
ALLOW: tools/workflow-api/api/health.mjs
ALLOW: tools/workflow-api/api/quote.mjs
ALLOW: tools/workflow-api/lib/quote.mjs
ALLOW: tools/workflow-api/lib/telemetry.mjs
ALLOW: tests/workflow-api-domain.test.mjs
ALLOW: tests/workflow-api-http.test.mjs
ALLOW: tools/workflow-api/postman/workflow-api.postman_collection.json
ALLOW: tools/workflow-api/postman/workflow-api.postman_environment.example.json
ALLOW: tools/workflow-api/lib/auth.mjs
ALLOW: tests/workflow-api-auth.test.mjs
ALLOW: deploy/datadog/vercel-api-monitors.json
ALLOW: docs/briefs/16-vercel-api-workflow.md
ALLOW: docs/demo/vercel-api-walkthrough.md
ALLOW: docs/automations/datadog-to-slack-mmani.md
```

These are proposed allowances, not authorization. The standalone manifest/lock contain no third-party dependency and remain consistent. The two new unit-test files live under the existing root test glob so required CI actually runs them. The standalone API uses native Node modules; this explicit stateless API scope follows Mahesh's request to allow an API-only proof and leaves the Next/React shopper architecture unchanged. No Terraform, GCP provider, database, persistent backend storage or dependency purchase is required. Split briefs/tasks by milestone and keep each PR under 30 files. No root manifest/lock, shopper source, golden, GCP implementation or custom Socket Mode bridge change is included. If a real requirement needs another path/dependency, present the concrete amendment first.

## Milestone 3 — repeatable team demo, documentation and teardown

Deliver a Postman collection with healthy/invalid/faulty/fixed requests and assertions for status, request identity and $97 totals, with no required local script/runtime. Environment examples contain placeholders only: protected base URL, approved run label and secret variable name. Store secrets as private local values; never export them. The curl implementation must keep headers out of shell tracing, output and process arguments, for example through a protected temporary curl configuration with cleanup, and refuse unapproved hosts/counts/windows.

Write a concise setup and Do/Say/See guide: **Do** the exact approved request/action/link, **Say** the talk track separating real telemetry from curated source fault and current results from historical replay, **See** the matching audience-visible status/IDs. Capture a small set of actual high-resolution images: protected healthy API, matching Vercel/US3 error, real monitor/Slack controls, independent Jira and native Debug/PR results, fixed Preview 200 and monitor recovery, exact review/Verify. Retain source, capture time and limits. No videos or fabricated cloud screenshots. Save this proposed plan as a separate PDF in the approved Work Drive folder. After implementation and actual evidence, refresh the correctly mapped setup/Do-Say-See PDFs under the existing Drive documentation authorization; retain sharing and file IDs and label all historical evidence. Do not publish abandoned provisional GCP documentation as a deployed guide.

Planned Do/Say/See sequence, to be replaced with tested commands and captured links after implementation:

| Do | Say | See |
| --- | --- | --- |
| Send the healthy Postman request to the protected healthy Preview | This valid quote is our reference contract. | 200, total $97, matching deployment and request IDs |
| Run the approved script once against the isolated faulty Preview | A curated source regression makes this valid request fail; this is a real function invocation. | HTTP 500, Vercel error, matching indexed US3 event |
| Open the resulting real Datadog Alert and its Slack thread | Datadog detected the application error and invoked the existing automation. | Exact monitor/event identity and two clickable native controls |
| In episode A, click Create Jira Ticket only | Tracking the incident is one independent choice. | One SC Bug and no coding task or PR; replay produces no duplicate |
| After recovery, trigger episode B and click Debug and Create PR first | The agent investigates the repository directly without a Jira dependency. | Reproduction, minimal regression/fix and one unmerged PR |
| Run the same quote against the fix Preview and inspect review/Verify | The source fix restores the contract; monitor recovery alone would not prove that. | 200/$97, preserved tests, exact-head reviews/QA and separate monitor OK |

SECURITY: show identities and outcomes, never bypass/Datadog credentials. WOW: pause at the direct log-to-source reproduction and independent Debug PR. Do not describe quiet logs as verified recovery of application behavior.

Record the exact one project, selected-project integration/drain, monitor and MMANI change receipts; deployment IDs/source SHAs; secret owners/revocation; actual request/incident/deployment counts; usage and retention. Use no cron, scheduled load or unattended fault/retry loop. Keep the faulty Preview protected and within the approved window. On stop: cease requests; observe/record the owned monitor state; disable only the new demo routing/drain or remove the new project under the approved cleanup scope; revoke dedicated bypass/ingestion credentials as appropriate; preserve history and PR evidence. Delete only positively identified demo resources, and record residual retention/billing rather than promising instant zero charges. Restore the previous MMANI identity configuration and leave existing local monitoring intact. No plan downgrade, unrelated integration/key deletion or production change is authorized by this proposal.

## Original draft checkpoint (superseded by the approval addendum)

Await Mahesh's approval of this implementation plan and the proposed `coderabbitai/coderabbit-automation-demo` project, incremental Vercel/Datadog usage allowance, live window/counts and private-credential/integration scope. Current selection, spend and live activation remain pending. Approving source implementation alone will not authorize service installation, credential transfer, live requests or a merge. Then begin **milestone 1 only**, present its concrete 200 + US3 intake receipts, and proceed through the agreed later checkpoints. No implementation or service action has started from this draft.
