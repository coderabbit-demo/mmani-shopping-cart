<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:85d40e5c02d6bdfa631ad7143fe5541f2823c4fa2ed1c0baec683624a69e1a3e -->

<!-- coderabbit-ai-generated-section:v1:35ea5d7f320c8e0ff88ac666a7bb3b820fe40ffc78e4e6c7ece2a512ff6434d5 -->

<!-- coderabbit-ai-generated-section:v1:98e7509b1ac57459d309c998c84e0c7f7ddb9fb4280692a534dd367bee5622e7 -->

<!-- coderabbit-ai-generated-section:v1:5039f9e7c35a6eacec1f09917ec1f066983771c3e47324e0c32bf79f355f5e9a -->

<!-- coderabbit-ai-generated-section:v1:f2babfc9d896baf352e4346e12fa5e3a05214cc0d8e379dcd1e5197b7741829d -->

# Next phase: a shared GCP incident demo

Move the runtime and operator trigger off Mahesh's Mac while retaining the native Datadog → CodeRabbit → Slack flow and its two independent actions. Target project: `se-demos-project`; existing baseline region/zone: `us-central1` / `us-central1-a`. This is a requirements and rollout document, not an apply or deployment approval. The approved $100 first-seven-days allowance begins at first actual DeskDrop resource consumption; none has started in this work. No actual spend or start/stop time is claimed.

## Brief 13 pilot status — November 6, 2026

The foundation/release extension is described in the [cloud release runbook](gcp-baseline.md#brief-13-foundation-before-cloud-release). It reuses the merged private baseline, resource addresses and GCS backend, and separates foundation, cloud build, exact-byte publication, release plan/apply and deployment. Its keyless Cloud Build identities and immutable GCS inputs remove the Mac's image-store requirement. The legacy local controller/trigger/checker/monitor contracts remain unchanged; Linux recurring monitoring and a server-side watchdog/lease are subsequent briefs. Operator disconnect is handled by retaining execution IDs and bounded readback, never blind resubmission. Concurrent presenters remain unsupported until the server lease is implemented and verified.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3c71086deb783a2278c6a422ac194a5a6527fa12a15b6088dbe207eb3d8e82b1 -->

Mahesh selected a **Mahesh-only pilot**, not team readiness, and approved $100 for the first seven days beginning with actual DeskDrop cloud consumption; none has been started by this work. The team group/second presenter are deferred. The orchestrator reports healthy user/ADC, billing and quota, and absent named resources, but several project IAM/storage/IAP rights remain missing. No credential, role or provider operation was used in this coding task. Actual resource ownership/access must be rechecked by the authorized orchestrator before applying each real plan. Terraform/provider locks, pinned host packages and runtime isolation are retained; only the approved Ubuntu successor `20261104a` changes.

<!-- /coderabbit-ai-generated:v1 --> <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:41ed393d82a4c90a9daddb6aaefe1c6ac464b76aec88428563960c3cd94232cc -->

Native OCI publication/worker capabilities remain fail-closed live prerequisites. The delegated binary receipts now pin official Docker29.9.3/Buildx0.38.2 and BuildKit0.34.2; their isolated binary success does not satisfy live capability receipts. The orchestrator also reports FileVault On for eventual durable bootstrap-state custody. The approved custody location, owner/access controls and recovery-copy/restore verification must still be recorded; FileVault status alone does not establish cloud state recovery.

<!-- /coderabbit-ai-generated:v1 -->

Release receipts bind source archive/generation, build/config/toolchain/OCI digests, principals/executions, explicit publication approval, readback, saved plan/input/backend/lock, prior rollback identity and host hashes. Foundation cannot deploy. Current and prior approved releases remain tagged and protected; no destructive cleanup is provided. Keyless worker accounts do not make pilot human auth or ungranted permissions disappear. Later unattended services need their own approved identities and fixtures.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a7721c4b14298b0e305d9d205bcfe1ccdc06b5bb5f946455f15031d8820c2785 -->

GH25 is the engineering acceptance record after the real engineering Jira create 403; no fabricated SC issue is used. The maintainer reports foundation PR28 open at `9e5700d46770ffd6be9add66c8141007f2bf7663` after its single Mac CLI review and corrections; CodeRabbit/security review and native Verify are running. Exact-head PR/security/CI and conclusive native QA Verify remain required before merge. Sandbox browser evidence proves only the unchanged shopper flow. Private GCP/app/metadata/egress/sandbox isolation, reboot, US3 telemetry, publication and team/disconnect/competing-presenter acceptance require their separate real fixtures. Preserve all existing scenario requirements; no local substitute proves live acceptance.

<!-- /coderabbit-ai-generated:v1 -->

The future cloud US3 installation must be new and separately owned: `service:deskdrop`, `env:gcp-demo`, `demo_id:mmani-shopping-cart-gcp`, `host:deskdrop-demo`, protected random owner tag. Do not replace local monitor IDs/selectors or expose management secrets/Docker sockets to app, checker or presenters. Native Jira/Debug remain independent and authoring has no CLI-login prerequisite. Keep the custom Socket Mode bridge paused.

## Reuse the reviewed baseline

The repository already contains a private Compute Engine baseline in `infra/bootstrap/`, `infra/terraform/`, `deploy/compose.yaml`, `deploy/bootstrap.sh` and `scripts/demo/baseline.mjs`. Reuse and extend that work rather than constructing a parallel deployment. It has not been demonstrated as a live GCP deployment. Its browser check is one-shot; the local recurring checker/heartbeat and automatic trigger are not already running in GCP.

| Existing requirement | Repository baseline |
| --- | --- |
| Terraform/provider | Exactly Terraform `1.15.3`, Google provider `8.10.0`; retain lock files and reviewed constraints |
| Runtime | Ubuntu 24.04 amd64 image, `e2-standard-2`, 30 GiB balanced boot disk; exact image/package pins in `deploy/runtime-versions.json` |
| Network | Dedicated VPC and `10.90.0.0/24` subnet, Cloud Router/NAT, no VM external address |
| Private access | IAP-source SSH firewall (`35.235.240.0/20`, TCP 22), OS Login, loopback app forwarder |
| Images | Regional Artifact Registry; application/checker digests and source labels verified before start |
| Credentials | Runtime service account can read its registry and the single intake secret; no secret value in Terraform input/state |
| Terraform state | Separate bootstrap bucket with private/versioned GCS state; protect the initial bootstrap state and test recovery |
| API enablement | Compute, Artifact Registry, Secret Manager, IAM, IAP and OS Login; preserve shared API ownership on teardown |

The storefront remains Next.js/localStorage-only. Moving the containers does not add a shopper-data backend. Operational leases/receipts are separate control-plane state.

## Team access model

Use an approved Google group for demo operators, with named maintainers for infrastructure, provider connections and costs. Grant only the IAP/OS Login/instance permissions needed for the selected access workflow. Do not grant Owner/Editor or expose ports publicly merely to make a demo convenient. The current baseline uses IAP SSH forwarding; its private app flow must be tested with a second operator account.

After deployment and access approval, the existing harness's `node scripts/demo/baseline.mjs tunnel` provides a bounded local tunnel on `127.0.0.1:3100`. The final team runbook must use verified commands/output from the deployed revision, not assume that Mac-only `local.mjs` works on Linux; it explicitly requires macOS today.

Replace the current Mahesh-only Slack member assignment with an explicitly approved team/group assignment for the chosen demo channel. Preserve other channels and Slack Default. Confirm each eligible operator can invoke both independent buttons and each ineligible actor is rejected. Verify the native repository authoring identity can read, commit and open a scoped PR for each operator. A Mac CLI login is for the review harness; it is not a native-authoring prerequisite and must not be copied into a sandbox.

## Terraform requirements before apply

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a55deb24ca2fd53c8ea4a42a0225b6168f67ec73a897e07e3545e50b98630ef1 -->

1. Review bootstrap and demo plans separately, including the actual state principal, globally unique bucket name, backend/prefix and recovery custody. The GCS backend supports state locking; enable object versioning and test restoration before multiple operators use it.
2. Resolve the actual team group and runtime/deployer/state-operator identities. Review resource-level IAM, service-account impersonation and organization policies. Do not create downloadable service-account keys for presenters.
3. Review the actual project, quota, region/zone, network overlaps, NAT egress, private Google access where applicable, firewall rules and OS Login/IAP permissions. Retain no-public-app-ingress and metadata/host isolation acceptance.
4. Verify current availability of every pinned VM/package/image artifact before the plan. Any pin/provider change needs an explicit brief and ALLOW authorization; do not silently upgrade a baseline that was reviewed with different versions.
5. Review images by immutable digest, source commit and SBOM/provenance where available; publish only after the separately approved image/deployment step. Preserve rollback tags and inspect registry cleanup behavior before enabling deletion live.
6. Create secret containers with Terraform and enroll values privately outside Terraform state. Keep the Agent intake key separate from a narrowly scoped Datadog management key used by the trigger. Decide which trusted control process can access that management secret; it does not belong in app/checker containers, image layers or startup metadata.
7. Use the dated [seven-day cost worksheet](gcp-costs.md): Mahesh owns the pilot; the $14.193528 priced illustration plus $20 unpriced-service reserve and $10 contingency gives a rounded $44.19 planning allocation against the approved $100 first-seven-days GCP operational allowance. It is not a complete quote, guaranteed cap, actual spend or permission readiness. The seven-day clock starts at actual first DeskDrop cloud consumption, which has not occurred in this work; record actual usage and deadline when observed. Recheck account rates and review budget notifications, usage and stop/teardown before live work. Notifications do not enforce a cap; keep protected state and current/prior rollback artifacts, and account for retained charges after VM stop.
8. Review saved plans, rollback and destroy plans before any apply. Keep bootstrap/state custody separate from ordinary demo teardown, and preserve shared APIs and unrelated IAM resources.

<!-- /coderabbit-ai-generated:v1 -->

## Port the monitoring and trigger deliberately

Create a separate GCP-owned monitor installation with its own protected state, tags and IDs. Do not reuse the local monitor IDs or overwrite their selector. Define the cloud environment, host/demo identity and operator/audience channel in the phase brief, then explicitly extend the automation's accepted identities and Datadog notification rule. Do not silently replace `env:local-demo` with a broad wildcard.

Port the 30-second availability, checkout and heartbeat scheduling to a Linux-compatible service with restart/reboot behavior. Keep the $100 / DESK15 / $12 / $97 assertions, fresh synthetic browser contexts, Chromium sandbox, bounded timeouts, independent heartbeat and no-overlap behavior. Separate image/registry evidence, browser correctness, network isolation and actual Datadog intake.

Expose a fixed-purpose trigger through the approved private operator path. Retain preflight, exact installation/monitor ownership, one-checkout-only notification window, durable lease/receipt, bounded failure, recovery and verified re-suppression. A server-side watchdog must restore state even if a presenter's tunnel or laptop disconnects. Do not give the app a Docker socket or management credentials to implement the trigger.

For multiple operators, start with one active rehearsal lease for the shared installation. A second operator receives a visible busy result and cannot overwrite its state. If the team later requires concurrent demos, design separate runtime/monitor/channel namespaces and cost ownership; changing only a Slack thread is not isolation. Prove artifact replay/deduplication behavior with the native platform, rather than treating prompt searches as a transaction lock.

Keep the custom Socket Mode bridge paused. Deploying it would be a separate product/permission decision, not a prerequisite to the currently demonstrated native flow.

## Complete native source remediation

The local source rehearsal produced [native PR #23](https://github.com/coderabbit-demo/mmani-shopping-cart/pull/23) from an explicitly approved faulty branch. Native CodeRabbit repository tools authored and published the fix after the Mac's one CLI review. Do not reintroduce separate cloud-task creation or sandbox CLI authentication as a prerequisite to coding. Retain native work-log, source/PR identity, CodeRabbit review and QA receipts.

For the team rollout, approve a reproducible isolated source fixture with expected failing/passing behavior and a safe reset. Use fresh refs; do not reset an earlier fixed branch. The native Debug path must produce at most one fix PR for that episode without consulting or attaching a Jira record. Keep one CLI review per new remediation flow, PR/security/CI feedback and exact-head native QA Agent Verify. Jira remains an independent path. Prove the same native authoring flow under the approved team actor mapping; cloud availability alone does not prove it.

## Rollout and acceptance

| Phase | Deliverable | Evidence needed before calling it ready |
| --- | --- | --- |
| A · Private baseline | Reviewed Terraform apply and immutable deployment | Saved plan identity; IAP access by two approved operators; no public app port; runtime secret boundary; source/image digest readback; convergent second plan |
| B · Always-on monitoring | Linux checker/Agent and cloud-owned monitors | Fresh successful checks and real US3 intake; bounded failure/recovery; heartbeat loss; restart/reboot recovery; exact ownership and suppression readback |
| C · Team trigger | Private trigger, lease, supervisor and operator docs | One isolated alert and restored state; second operator busy/rejected; terminal/tunnel disconnect; failed-write reconciliation; no unrelated monitor/container changes |
| D · Native choices | Independent Jira and Debug actions for approved team actors | Both button orders; one correct incident Bug when Jira is selected; repository investigation when only Debug is selected; visible provider failures; replay/concurrent-click tests |
| E · Fix PR proof | Approved faulty source to one unmerged fix PR | Actual native work-log, commit and PR links; assertion RED/GREEN; single CLI receipt; exact-head PR/security/CI and conclusive native Verify; no Jira dependency |
| F · Handoff | A second presenter runs and resets the demo unaided | Do / Say / See rehearsal, owner/escalation map, dated receipts, restore drill, cost review and teardown exercise |

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d8793a66ac36c4a5ab41c019642c580b04291b9ebfd9aede3be16d8a90b7f1f7 -->

The phase is team-ready only after an operator other than Mahesh completes the end-to-end rehearsal and reset without using his Mac, local credential files, browser session or personal tokens. Record remaining limits explicitly. Do not present Terraform validation, mocked checks, sandbox QA or the local SC-41 run as live GCP acceptance.

## Review correction and credential-free native Verify plan

The single Mac CLI review completed on `ae0e7cd7724d4b500ab4906a4bd3d5cd65385912` against foundation `5e40a573e7f6554e33e91f71c09acf3ecbd26f5b`: two Major findings and one Minor. Corrections preserve existing assertions: normal in-flight checkout remains healthy; expired or unsafe work stays degraded; inventory equality compares stable safety configuration; management and service supervision hold one kernel `lifecycle.lock` for their entire operation. The supervisor checks the exact-owned installer before reading runtime-ready state. A live or uncertain installer is never stopped automatically to permit service startup.

This changes an internal lock filename; JS exports and bundle/receipt formats remain compatible with the trigger's ae0e snapshot. The optional `inventory(page, owner)` owner parameter narrows unrelated configuration comparison; existing one-argument callers retain stable safety-field comparison. A trigger integrating the snapshot must not copy the old separate host lock implementation back over this correction.

Stop the old monitoring service and any live installer before replacing host code; do not mix old and new lock protocols. A timed-out Docker client may leave its exact-owned installer alive after the host lease is released. Service starts then fail closed even if a prior verified journal exists. Inspect the exact-owned installer and reconcile its terminal provider outcome with the protected journal before manual service restart. Do not delete intent, steal a live lock, or force-stop a foreign container. Systemd's bounded restart attempts may exhaust during reconciliation; after repair use `systemctl reset-failed deskdrop-monitoring.service` and explicitly start it. These are future approved operator steps, not sandbox actions.

### Native Verify workflow (offline scope)

No new tracked fixture path is required for this plan. The native verifier can create a disposable inline Node runner under its own `/tmp` directory, import the actual exports listed below from the recorded checkout, and retain sanitized observation JSON under its Outputs. This runner must use only Node standard library and existing dependencies. Do not run root CLI entrypoints, supply production credentials, mount Docker, call metadata, or treat a green unit-test summary as proof of the workflow.

1. Record the full checkout SHA and clean status; read the exported signatures directly. Start the managed QA script and wait for ready before browser access. In shared cloud Chromium at `http://localhost:3100/`, use fresh storage and synthetic details to place the Terracotta lamp/Natural oak organizer DESK15 express order. Inspect actual checkout/receipt/history values and both items, capture screenshots only, then clear storage and stop the owned script. This verifies shopper integration in the sandbox.
2. Import `scheduler`, `heartbeatWorker`, `heartbeat`, `datagram`, `jobs`, `dockerTransport` and `boundedRun` from `scripts/demo/cloud-runtime.mjs`. Use a runner-owned Unix HTTP socket that implements the exact allowed Docker operations; its fixture container records carry the real `checkerSpec` configuration, source/owner/bundle labels and isolated app/network records. Record each create/start/inspect/stop/kill/delete operation, with the synthetic identity and final absence. Verify two sequential checkouts get separate creates, an unknown create reconciles without another POST, foreign owner/app/network cannot be mutated, and cleanup uncertainty blocks replacement. API response fixtures prove controller decisions, not genuine container isolation.
3. Drive the actual scheduler with its exported injected clock/timer callbacks. Hold checkout's promise while availability finishes and call the actual heartbeat worker with a separate timer: observe normal healthy status, then advance across the30-second overlap boundary and observe critical status without a second checkout. Release the owned work, confirm safe recovery; separately reject cleanup or reporting and confirm latched critical health. Save transitions and call counts, not just assertions or test stdout.
4. Spawn runner-owned disposable Node children: one ignores TERM, one unrelated sentinel remains alive, and another process runs the exported heartbeat worker. Use `boundedRun` with accelerated injected deadline timers to observe TERM, forced KILL/removal and actual child exit while heartbeat continues. Retain PID/exit/signal observations in the private local verification record; never signal an unowned process. Close all children/socket endpoints in `finally`, then confirm no owned process or socket remains. This proves an OS process boundary, not Docker/systemd or reboot behavior.
5. Import `inventory`, `definitions`, `install`, `reconcile`, `reconcileProtection`, `removeOwned` and `Journal` from `scripts/demo/cloud-monitors.mjs`. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4da55f06367aff2d355a7e7bd5277a32371b0f9ec9e3655c1b6a3c1ef67d857b -->

Use injected API functions with synthetic records and a user-owned0700 directory under the secured home directory (all parents must pass the actual journal permission checks) via the explicit `Journal(directory, process.getuid())` API.

<!-- /coderabbit-ai-generated:v1 --> Store real journal transitions and provider-operation observations before/after simulated lost responses. Alter unrelated timestamps/overall state between scans and confirm reconciliation succeeds; alter owned message, thresholds/no-data/include-tags/new-group-delay, selector, status/scope/schedule/suppression settings and confirm refusal with intent retained and no duplicate write. Preserve actual returned rows for inspection. No management key is needed for these exported injected APIs.
6. For host lease workflow, the existing `tests/demo-baseline.test.mjs` fixtures execute the actual embedded Python with disposable paths and injected command boundaries. They include real kernel-flock contention across processes and recovery after owner death. They also record supervisor startup refusal before journal read when an installer is alive or uncertain. Reuse these focused tests as supporting evidence only; do not claim they demonstrate an actual VM/systemd workflow. A standalone reusable host adapter would require a separately proposed exact test-only path before editing; none is added here.

Conclusive native Verify must explicitly report which steps it actually executes and attach operation/state/exit observations plus browser screenshots. If its runner cannot perform an operation or preserve evidence, report that step blocked; do not substitute a unit PASS line. Actual Ubuntu24.04 Node image/linkage/Docker/systemd/reboot/non-admin access, GCP private access and US3 telemetry remain separately approved live acceptance requirements. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a23ec7b5734eb2c26c5b2145da9c6eea51875ef54bfea31362e234b3ad2718e3 -->

Foundation PR28 final source `afbde6c9c1d946989918ce5187bae194cc1a0b68` is integrated as a task parent, not claimed merged to main. Its actual `tests/fixtures/cloud-release.mjs` exports `withCloudReleaseFixture`, `checkoutSha`, `tar`, `oci` and `execution`; the linked-worktree metadata handling and test-only custody/provider adapter were inspected. This adapter supports foundation fixture operations, not arbitrary monitoring-install SSH or real Docker/Datadog operations. Production foundation interfaces are unchanged. The complete standalone six-scenario native Verify driver plan is exported as `output/gcp-monitoring/native-verify-plan.md` in this task. It uses real exported APIs with owned disposable sockets/files/processes and direct evidence; genuine VM/provider state is not an offline QA prerequisite. A standalone reusable monitoring host adapter, if required later, is proposed at `tests/fixtures/cloud-monitoring.mjs` for scope approval before editing; no new fixture path is added.

<!-- /coderabbit-ai-generated:v1 -->


<!-- /coderabbit-ai-generated:v1 -->

## Primary references

- [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding) for private VM access and target permissions.
- [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs) for state locking, existing-bucket requirements and recovery recommendations.
- [Secret Manager access control](https://docs.cloud.google.com/secret-manager/docs/access-control) for least privilege and Compute Engine scope requirements.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:951885492dd0890a2233ebc3f8b49cffde47a4c12862ab88f6f7883b5de6350f -->

- The existing [private baseline runbook](gcp-baseline.md) and [cost worksheet](gcp-costs.md) remain the detailed deployment references.

# Brief 14: GCP recurring monitoring implementation

## Scope and release gates

This is the cloud-only implementation for [GH26](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/26), under the delegated engineering acceptance exception. Foundation interface source is **5e40a573e7f6554e33e91f71c09acf3ecbd26f5b**; integration merge is **54b8bd1839d824d2376d1fc88f49acb073116e70**. These are published task snapshots, not a foundation main merge or deployment receipt. The separately announced Darwin fixture-only correction and any later foundation interface changes must be integrated before final review. Main-target PR publication waits for foundation merge and a monitoring-only diff under 30 paths, within Brief14's18 allowed paths.

No cloud installation, IAM write, secret provisioning, monitor creation, routing activation or provider acceptance has been performed by this task. The Mac supplies this task's single completed CLI review on the completed diff. Keep Autofix and task CLI review off. Native QA Verify must subsequently run on the final head. Screenshots only; no videos.

## Runtime and trust boundaries

Ubuntu24.04 amd64 must provide the existing foundation's Python3, systemd, Docker29.9.3 and Compose5.7.0. **Host Node is not required.** A distinct trusted container uses the existing pinned image `node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607`. Installation pulls that digest, checks linux/amd64 and executes `node --version` with networking disabled; subsequent starts use `--pull never`. The controller uses Node's standard-library HTTP client on the Unix Docker socket, with exact operation/path allowlists and bounded responses. No Docker CLI is assumed inside that image. The host Python supervisor uses the foundation's existing Docker CLI.

| Actor | Access |
| --- | --- |
| App and disposable checker | Nonroot; internal bridge; no socket, key, host mount, metadata or outbound IPv4/IPv6 access. Checker uses the existing Chromium sandbox/seccomp and fresh context. |
| Controller and cleanup container | Trusted root Docker administrative boundary; fixed source/owner/image configuration; Docker socket; no management or intake secret mount. Not connected to the storefront bridge. |
| Independent heartbeat container | Host loopback UDP only in its implementation; read-only monitoring state and code; no socket or secrets. Separate process even while a browser hangs. |
| Agent | Existing pinned trusted Agent; intake secret only; host networking allows loopback DogStatsD. Nonlocal DogStatsD remains disabled. |
| One-shot installer | Root, separate management-secret mount, no Docker socket. US3 only; no secret values in arguments, output, Terraform or images. |

Root Docker can administer the host; it is intentionally outside the app/checker boundary. Presenters must have neither Docker-group membership nor unrestricted sudo. Nonroot host OUTPUT rules deny169.254.169.254 and fd20:ce::254 independently of bridge rules. Root bootstrap metadata access remains available. Later non-admin testing must verify metadata.google.internal and metadata aliases resolve to the protected addresses and that no alternate metadata path exists. Mahesh's current Editor/admin access is not least-privilege presenter evidence.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:88c24eb11bde279767678465e15b76fa454012992f618ace1eb330fba17ea575 -->

The separate `deskdrop-datadog-management` Secret Manager resource has a resource-scoped runtime-service-account accessor grant.

For the separate live gate, verify the existing Datadog application key's actual scopes without acquiring or expanding credentials: downtime create/cancel requires `monitors_downtime`; monitor reads use `monitors_read`, and monitor create/update/delete uses `monitors_write`; notification-rule GET uses `monitors_read`, while notification-rule mutation, if ever separately approved, requires `monitor_config_policy_write`. Do not substitute `monitors_write` for downtime or notification-policy permissions. Current recurring installation retains suppression and does not cancel downtime or mutate notification rules. These are documented required existing-key permissions, not a claim that a key has been inspected, granted, or tested live.


<!-- /coderabbit-ai-generated:v1 --> It has **no Terraform secret value/version**. The separate installer fetches its JSON `apiKey` and `appKey` through the verified VM identity; recurring processes do not fetch or mount it. Current IAM/IAP/storage authority gaps remain live prerequisites; no broader role or alternate identity is authorized.

## Source-bound installation (later approved cloud stage)

Use only the approved work-account identity and foundation workflow. All steps below describe future operator actions, not actions performed in sandbox validation.

1. Record `git rev-parse HEAD`. Require a clean checkout containing reviewed foundation and monitoring changes. Build/publish the app and checker from that exact source using the foundation's cloud release workflow. The checker image must include `cloud-checker.mjs`; old foundation-only image receipts cannot authorize this stage.
2. Obtain genuine matching `release.json` (phase `release`), source/bundle verification, release plan/apply, deployment approval, `host-install.json` and `deployment.json` receipts. Apply the approved Terraform management-secret resource/grant only with separately confirmed authority. Provision a scoped US3 management secret separately; never place a value in a command argument or source file.
3. Run `node scripts/demo/baseline.mjs monitoring-install` in the operator's prepared repository toolchain. This validates current release/plan/backend/image/deployment and exact bootstrap/Compose hashes. It transfers a gzip tar made with the foundation's actual archive/compress helpers, containing exactly both JS modules, the systemd unit, a hash manifest and runtime configuration. Every module/unit and source commit is bound in the bundle. The remote JSON receipt must match the archive digest, manifest digest, source and all module hashes before local `monitoring-install.json` is saved. Foundation-only receipts are rejected.
4. On the verified VM, use `sudo /opt/deskdrop/bootstrap.sh monitoring-protect`. This is the separate management stage, not recurring runtime. It creates or reconciles the protected cloud installation. It refuses to run while controller/heartbeat containers exist; stop the monitoring service first when reconciling an existing installation. Host flock and the fixed installer-container name serialize installation. A still-running previous installer blocks another attempt. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ec85cd34ba047f276049d2c0804fcf5e037fb158983cd87569b7b1682db78c84 -->

A stopped exact-owned installer can be removed only when no journal lock remains. A surviving installation.lock blocks management; it is never automatically reclaimed. Preserve the journal, lock and all unknown intents for protected maintenance.

<!-- /coderabbit-ai-generated:v1 -->
5. Only after `protected` success, `sudo systemctl enable --now deskdrop-monitoring.service`. The source-bound Python supervisor starts the independent heartbeat and controller, checks both processes, and bounds restart attempts through systemd. `sudo systemctl stop deskdrop-monitoring.service` stops only exact-owned control containers and runs the source-bound checker cleanup adapter before returning. Reboot uses the enabled unit and cached pinned image; no Mac or personal browser is involved.

Source/owner disagreement, noncanonical paths, symlinks, hardlinks, unexpected modes, corruption or unknown ownership fail closed. Every installed monitoring file is root0600 under root0700; every parent is checked. The systemd unit is copied from the hashed bundle. The durable journal and bundle receipt live under `/var/lib/deskdrop/monitoring`; updates use fsync and atomic replacement. Installation publishes its directory atomically. An identical interrupted transfer can be retried and returns the same receipt. A different release/bundle does not overwrite existing state: it reports an explicit migration requirement. Retain the bundle and journal for a separately reviewed release migration rather than deleting them.

## Scheduling, health and reconciliation

- Availability and the existing full checkout run every30 seconds. Checkout checks100-15+12=97 at checkout, receipt and history, with Terracotta Arc lamp and Natural oak organizer, quantity1 each. Every execution creates/removes a disposable checker container; the original journey opens/closes a fresh browser context.
- Each attempt has a25-second execution budget including Docker setup/read calls. At the deadline, the controller requests TERM with3-second grace, then bounded inspect/KILL/delete/readback. Cleanup calls are bounded individually (2 seconds; TERM request4 seconds). Worst-case cleanup may pass the next30-second tick; that tick reports degraded health and **never** overlaps or catches up. A remaining or ambiguous child blocks replacement. Unknown create/start results inspect and clean only the verified owned name; no blind retry POST occurs.
- The controller checks the running app's source/image and isolated network before mutation. Children carry exact owner/source/check/bundle labels, fixed commands, nonroot UID, seccomp, capabilities, readonly filesystem and approved environment. Foreign or drifted objects are never stopped or deleted.
- Heartbeat publishes every30 seconds in its own container. Missing, wrong-source, unhealthy or older-than65-second health is critical. Scheduling, reporting or cleanup failure cannot be marked healthy. A failed controller can remain deliberately latched unhealthy pending operator reconciliation; automatic supervisor restarts are bounded. UDP send success is not Datadog intake evidence.
- Systemd shutdown invokes bounded control cleanup and then a separate trusted cleanup container to handle a killed controller's orphaned checker. On restart, the controller reconciles existing exact-owned checkers before starting new work. Unknown Docker failures retain a degraded state rather than permitting overlap.

## Cloud monitor ownership and suppression

New checks are `deskdrop.cloud.availability`, `deskdrop.cloud.checkout` and `deskdrop.cloud.heartbeat`, US3 only. Exact tags: `service:deskdrop`, `env:gcp-demo`, `demo_id:mmani-shopping-cart-gcp`, `host:deskdrop-demo`, `managed_by:deskdrop-gcp-controller`, plus a root-protected random `cloud_owner:<32hex>`. Both queries and telemetry contain the owner. `deploy/datadog/cloud-monitors.json` documents this contract; JS definitions construct the owner-specific records.

The installer first journals intent for a permanent silent downtime covering only all six installation tags. Then it validates the active downtime before each monitor creation. Each provider write has a durable prior intent. Two complete stable inventory scans and exact GET verification reconcile lost responses without duplicate creates/deletes. Ambiguous, missing or changing records leave the intent pending. Effective downtime matching must cover each real monitor ID before the journal becomes runtime-ready. Monitors contain no notification handles; routing/activation remains separately approved acceptance. No mutation targets local IDs29524290/29524154/29524292, local selectors, defaults or suppressions.

After stopping the service, `sudo /opt/deskdrop/bootstrap.sh monitoring-inspect` reconciles unknown remote outcomes; `monitoring-protect` resumes exact-owned protected installation. A missing result after an unknown POST is not proof that it failed: preserve the pending intent and investigate. Never erase the journal to retry. For separately approved teardown, `monitoring-delete` deletes only exact-owned monitor IDs after revalidation and intent persistence. It retains the protective downtime and ownership journal; it never cancels suppression, alters shared/local resources or silently starts a new installation.

Datadog response assumptions are based on the official [v2 downtime API client](https://github.com/DataDog/datadog-api-client-typescript/blob/master/packages/datadog-api-client-v2/apis/DowntimesApi.ts) and its models: active status, one-time schedule with no end, exact monitor tags, `downtime_matches`, and `meta.page.total_filtered_count`. Offline injected responses test these contracts; live readback remains required.

## Observable verification

From the prepared repository, use its existing Node toolchain:

```sh
node --test tests/cloud-monitoring.test.mjs tests/cloud-monitors.test.mjs tests/demo-baseline.test.mjs tests/local-datadog-monitors.test.mjs tests/deployed-checker.test.mjs
npm test
npm run typecheck
npm run golden:check
PLAYWRIGHT_PORT=3101 npm run test:e2e -- tests/e2e/checkout.spec.ts tests/e2e/persistence.spec.ts
terraform fmt -check -recursive infra
```

In `infra/terraform`, use pinned Terraform1.15.3, `terraform init -backend=false -lockfile=readonly -input=false`, `terraform validate`, and `env -i PATH="<directory containing pinned terraform>:/usr/bin:/bin" TF_IN_AUTOMATION=1 terraform test`. Backend-disabled mock tests must receive no ADC or provider secret environment. Do not substitute a live plan/apply for a mock test.

| Offline observable test | Separate live acceptance still required |
| --- | --- |
| Unix-socket Docker fixture: real HTTP operations, fresh creation/removal, unknown create, forced KILL, wrong owner/app/network, no forbidden mutations | Actual pinned image/Node linkage, Docker Engine socket compatibility, Chromium sandbox, UID/mount/network inspection on Ubuntu24.04 |
| Disposable OS processes: hung checker ignores TERM, KILL cleanup, unrelated process survives; independent production heartbeat loop ticks | systemd stop/start/reboot; owned orphan reconciliation; persistent root state across VM reboot |
| Provider fixtures: prior intent, stable pagination, lost create/delete/downtime response, exact effective suppression | Fresh US3 service-check intake, actual new IDs/selectors, effective downtime readback, failure/no-data alerts and separately approved routing |
| Actual host Python/bundle parsing and security fixtures; metadata policy RED on foundation, GREEN on correction | Non-admin presenter denied metadata/host/socket/egress; private IAP access; resource-scoped IAM/storage permissions |
| Existing goldens, all assertions, checkout/persistence and shared Chromium screenshots | Live private deployment, worker, reboot, telemetry, publication and independent incident workflow acceptance |

For native sandbox QA, start `bash /home/vercel-sandbox/runtime/repository-startup.sh`, wait for app-ready, and visit `http://localhost:3100/` in the shared cloud Chromium with fresh storage and synthetic shopper data. Record the actual checkout commit. Capture high-resolution checkout/receipt/history screenshots, confirm both items and$97, then clear synthetic storage and stop the managed process. Native Debug directly inspects repository/application behavior and needs no external ticket prerequisite. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:44bd6847a488e12e1692f06670c001ee9ee8f249b94173fef082983017f6e73c -->

Sandbox success does not prove private GCP isolation or deployment. Keep existing private-infrastructure, reboot, telemetry and publication scenarios pending until their separately approved fixtures and authority exist.

## PR29 host metadata protocol boundary and protected lock recovery

Host-originated nonroot DNS (UDP/TCP53) and NTP (UDP123) are allowed only to169.254.169.254/32 andfd20:ce::254/128. These three exact exceptions precede the all-protocol nonroot metadata deny, including upgrade from an older first-position reject. Reapplication removes/reinserts only those exact exceptions; it never flushes OUTPUT or unrelated rules. Nonroot HTTP80/HTTPS443 and every other metadata protocol/port remain denied; root bootstrap metadata access remains available. This host OUTPUT exception gives app/checker containers no bridge access, socket, credentials or egress. Their IPv4/IPv6 bridge rules and sandbox restrictions remain unchanged.

Google documents those addresses for [internal DNS](https://docs.cloud.google.com/compute/docs/internal-dns), and its [NTP configuration](https://docs.cloud.google.com/compute/docs/instances/time-synchronization/configure-ntp) uses metadata.google.internal. Upstream [systemd255 resolved service](https://github.com/systemd/systemd/blob/v255/units/systemd-resolved.service.in) runs as systemd-resolve; even a root download can depend on that nonroot resolver. [Metadata API queries](https://docs.cloud.google.com/compute/docs/metadata/querying-metadata) use HTTP/HTTPS. This corrects the overbroad host deny without granting presenter metadata API access.

A mkdir installation.lock survives SIGKILL and reboot. DESKDROP_INSTALLATION_LOCK_HELD identifies this protected lock, not a proven live PID; its owner can be live, abandoned or unknown. The installer reports a fixed nonsecret diagnostic before reading credentials. Host management likewise refuses a remaining lock before refresh, installer removal or launch. Neither path auto-unlinks it based on PID absence, a timeout or reboot. This deliberately replaces the previous automatic empty-lock reclaim in the host wrapper. No public export, permission or bundle/receipt shape changes.

Protected manual maintenance is a separately authorized operator action: stop the monitoring service and prevent restart, acquire and continuously hold the existing root-owned lifecycle.lock, verify source/owner labels and exact installer identity, and establish its terminal outcome (a timed-out client is insufficient). Preserve protected copies of the lock/journal and pending intent. Reconcile the exact owned provider outcome against durable intent using approved existing access; retain ambiguous outcomes and all local/unrelated resources. Only after that reconciliation may the operator remove an inspected empty, correctly owned lock directory while retaining the lifecycle lease. Never follow a symlink, recursively delete a lock, discard intent, or use a PID/deadline heuristic. There is no general unlock/reconcile command for a surviving lock: if these proofs cannot be obtained, leave it blocked for maintenance. Release the lease after maintenance, run the guarded inspect/protection workflow, and explicitly restart the service only when protected state is verified; exhausted systemd attempts may require reset-failed. No such host/provider action was performed in sandbox QA.

Offline packet-model execution verifies fresh/legacy/repeat ordering and independent packet outcomes, not a kernel firewall. Separate live Ubuntu VM acceptance must verify actual resolver DNS UDP/TCP, time synchronization UDP123, non-admin metadata HTTP/HTTPS/other denial, root bootstrap metadata access and isolated app/checker IPv4/IPv6 behavior across boot/restart. Existing private-access, telemetry and publication gates remain pending. Native PR29 QA must use the corrected final head and observe this policy scenario in addition to its six supported scenarios; a generated plan or unit PASS alone is insufficient.


<!-- /coderabbit-ai-generated:v1 -->


<!-- /coderabbit-ai-generated:v1 -->


<!-- /coderabbit-ai-generated:v1 -->
## Stage 15 preliminary operator installation and handoff

This source integrates published monitoring `ae0e7cd7724d4b500ab4906a4bd3d5cd65385912`. Final merged foundation and monitoring source, review/security/CI and native QA gates remain required before publication. No live resources were created. The $44.19 illustrative allocation and $100 operational allowance in [the cost worksheet](gcp-costs.md) are unchanged; neither is actual spend or permission readiness.

After separately approved release/deployment and stage14 monitoring installation on the **same final source**, the actual authoring command is `node scripts/demo/baseline.mjs trigger-install`. It checks the existing release, deployment approval, host hashes and monitoring-install receipt before source-bound transfer. Root installation validates the archive digest, member names, source, all module/unit hashes and installed monitoring bytes. It refuses a different existing bundle; do not delete state or silently replace a release. The installer does not create a routing rule or grant access.

An authorized root maintainer stages `/etc/deskdrop/trigger-enrollment.json` (regular, root-owned, mode0600; protected parents). Its exact fields are `uid` (actual integer OS Login UID), `username` (actual NSS name), `rule` (actual approved cloud notification-rule ID) and `recipient` (actual approved cloud recipient handle). No example identity or rule ID is supplied. Run `/usr/bin/python3 -I -B /opt/deskdrop/trigger/deskdrop-operator --enroll`. It validates the actual metadata OS Login mapping for mahesh@coderabbit.ai and NSS identity, then persists private enrollment/routing. This needs existing administrator authority; presenters do not get sudo, Docker access, credentials or metadata access. Missing IAM/IAP authority is a blocker, not permission to add roles. Team enrollment and denied non-admin acceptance remain deferred.

With routing, effective protection and runtime health independently verified, the authorized maintainer enables boot recovery and the broker with `systemctl enable --now deskdrop-trigger-recovery.service deskdrop-trigger.service`. Do not enable before final source/permission/live approval. These are protected maintainer operations, not presenter helper arguments. Node runs only in the existing pinned trusted image; no host Node or Docker CLI inside that image is assumed. Management credentials are refreshed into a private runtime mount for lifecycle/recovery only. Storefront and checker mounts/pins remain unchanged.

The installed public interface is exactly:

```sh
/usr/local/bin/deskdrop-operator status
/usr/local/bin/deskdrop-operator trigger
/usr/local/bin/deskdrop-operator recover
```

Use these inside the private VM via existing authorized OS Login/IAP access. No target/path/identity/environment/command arguments are accepted. A client disconnect does not cancel a durable admission. Busy/recovery replies refer to the existing run. A caller timeout means an unknown acknowledgment: read status, never launch another speculative fault. The root recovery service owns the worker independently of the Mac, browser or broker. It starts admission closed on boot, fences its exact owned stale container, and reconciles the journal before opening admission. The November6 2026 15:00UTC admission cutoff is retained; it is not silently extended. Recovery continues after cutoff.

The broad stage14 downtime initially protects all three monitors. A trigger persists and confirms three temporary exact-monitor protections before canceling broad protection, then cancels only checkout's temporary protection. Availability and heartbeat remain suppressed and recurring checks continue. The existing install-focused API stays unchanged; the trigger adds read-only rule inventory/detail and monitor-group reads. It never updates a monitor or notification rule. All matching rules must prove the enrolled Alert-only route; unsupported filters, changing pagination or extra effective downtimes close admission.

Recovery always attempts the exact owned app start after bounded protection work, including provider readback failure. It restores a broad guard and retires temporary protections before updating the stage14 protection ID. Unknown writes remain in the journal and are not blindly replayed. A missing unknown POST cannot be retried. An uncertain Docker stop retains its runtime uncertainty even if the app is subsequently running. New admissions require effective suppression, exact app/source, fresh monitoring health and complete reservation reconciliation. The root counter reserves at most three cycles, including admissions whose caller died.

For shutdown, an authorized maintainer stops the broker first, then `systemctl stop deskdrop-trigger-recovery.service`; allow its recovery/cleanup bound. Do not stop recovery to conceal uncertainty or delete its journal. To resume, start recovery then broker; reboot recovery is enabled through systemd. All real systemd/reboot/host isolation and cloud intake results remain pending. See [trigger evidence](gcp-trigger-evidence.md) for source/offline versus live provenance.


<!-- /coderabbit-ai-generated:v1 -->
## Reviewed-parent integration and management permissions

The trigger now integrates final published monitoring `8f91bc3a35af30979b8e28650a1ff86485fdfd2b`, including foundation `afbde6c9c1d946989918ce5187bae194cc1a0b68`, in merge `28e6b52f52a302b636f93c5a4c5d8b80465eb5c1` after fixture checkpoint `d2678968f7dce253f7a8d3410e70324b9f6b500a`. Neither is represented as main-merged or live accepted. Monitoring retains its exclusive `lifecycle.lock` shared by recurring supervision and management. Trigger recovery and monitor management additionally share `trigger-maintenance.lock`; the trigger does not take the continuously held recurring lifecycle lease. Monitor management acquires the maintenance gate before the lifecycle lease. This permits recurrence during a fault while excluding concurrent management writes. No parent assertions were removed.

The existing management credential needs Datadog **monitors_downtime** for downtime create/cancel and **monitors_read** for notification-rule GET. These are documented prerequisites, not authorization to create a new key, expand scopes or obtain additional permission. Missing scope blocks live admission; runtime restoration is still attempted independently.

The `deskdrop-firewall.service` dependency is installed by `deploy/bootstrap.sh install`: it writes the unit, reloads systemd and enables the firewall and app units. Its firewall unit runs `/opt/deskdrop/bootstrap.sh firewall` before Docker and declares `RequiredBy=docker.service`. The sandbox has not run that privileged host installer, so its missing-unit diagnostic was expected sandbox absence, not a missing production source definition. An offline regression now checks generation, enablement and trigger dependencies. Actual installed unit contents and successful boot execution remain separate live gates.


<!-- /coderabbit-ai-generated:v1 -->
## Reusable offline trigger verification and activation window

The approved24th path, tests/fixtures/cloud-trigger.mjs, now provides private disposable custody and controlled adapters for the actual exported trigger/recovery APIs. See [the API and independent workflow instructions](gcp-trigger-evidence.md#reusable-verify-fixture-implemented-under-the24-path-amendment). It supplies no credentials, live transport, default root artifacts or precomputed verdict. Native Verify must independently choose operations and assert returns, saved intents/receipts and call records. Real Linux peer/socket/process observations are separate from its synthetic clock/boot/provider responses; actual VM/systemd/reboot/intake remains pending.

The hard November6 2026 07:00Pacific /15:00UTC admission cutoff enforces this delivery window. Any later operator activation requires reviewed renewal; neither the cutoff nor the three-cycle limit was extended. Mahesh reports the07:10UTC work-account/ADC check still returned34/46 permissions, with12 not returned including project.setIamPolicy/IAP. This task did not repeat that credential check. No cloud writes have started; these counts do not establish live readiness or authority to acquire new roles/key scopes.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d22909021627d628842eadd4bdf756175333b2f1e84b7eca2eae3018a08226ef -->


## Access receipt and named-resource prerequisites — November 6, 2026

Mahesh reports the fresh **07:10 UTC** work-account/ADC check returned **34 of 46 permissions**, with **12 not returned**, including project IAM policy writes and IAP. This is orchestrator-supplied evidence, not a credential check performed by this task. A not-returned permission is not tested authorization. Existing Editor, a working login and adequate quota do not establish these missing rights. Foundation native QA is reported RUNNING6 at `afbde6c9c1d946989918ce5187bae194cc1a0b68` in task `c23f828a-b95a-4f13-a5a5-a5c03d7decc1`; running is not a pass or publication approval.

Before separately approved live operations, an already-authorized administrator must establish the exact capabilities required by the reviewed plan, on its named resources:

| Boundary in `se-demos-project` | Required existing authority and verification |
| --- | --- |
| State bucket `se-demos-project-deskdrop-tfstate`; source/artifact buckets `se-demos-project-deskdrop-source` and `se-demos-project-deskdrop-artifacts` | Bucket creation/read and bucket-policy get/set where the plan manages bindings; only necessary state-lock/object and source/artifact operations on the respective bucket. |
| Artifact Registry `us-central1/deskdrop` | Repository administration/policy get/set for reviewed resources; publisher upload and runtime pull remain distinct resource bindings. |
| Secrets `deskdrop-datadog-intake` and `deskdrop-datadog-management` | Named-secret administration/policy get/set and separately authorized version provisioning; runtime accessor bindings remain scoped to those secrets. Never infer access from an Editor role. |
| Service accounts `deskdrop-demo-runtime`, `deskdrop-build`, `deskdrop-publisher` | Only the reviewed account creation/policy and `actAs` capabilities for the selected workflow. Project `resourcemanager.projects.setIamPolicy` remains unconfirmed where project-level bindings require it; no broader role is requested. |
| VM `deskdrop-demo`, zone `us-central1-a` | Actual IAP tunnel authorization for this instance (including `iap.tunnelInstances.accessViaIAP`), OS Login and service-account-use prerequisites must be verified. Protected install/enrollment needs authorized OS Admin Login/root maintainer access; presenter helper access does not grant sudo or Docker. Preserve the IAP-only TCP22 firewall and private app path. |

These are blockers to establish through existing authorized administration, not instructions to acquire roles, widen identities, guess a group/tester or relax private access. No provider writes occurred here. Mahesh administrator success cannot prove denied non-admin/presenter access; that remains a separate live gate. The $44.19 dated illustration and $100 allowance are unchanged and neither establishes permission readiness. The seven-day allowance begins only at actual first consumption; the hard delivery-window admission cutoff independently still requires reviewed renewal for later activation.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:362569d38706a45518c1b57b528508d49b237504f064b80d2dfb37b266a17d22 -->


## Broker availability during supervised work

The public status/trigger/recover protocol is unchanged. The supervisor holds a separate protected `worker.lock` while invoking exact-owned controllers; broker and supervisor hold `execution.lock` only for short journal/admission transactions. Existing management exclusion and supervisor lease remain. An active inspection retains the prior readiness proof only within its existing five-second freshness bound; failed/unsafe inspection closes admission. A concurrent admitted lease is never replaced by an inspection result.

`recover` returning `joined` means the request has been durably saved before the response. A transient journal-lock conflict returns `busy`, which does not acknowledge recovery; read status and retry the same recovery request. The broker only enqueues. The active controller reads the durable request during Alert observation; supervised recovery rereads the lease before updating phase and preserves the flag. Native Verify should hold a controlled worker open while independently issuing status/admission/recovery, inspect the saved lease before releasing it, and verify one admission, no lost recovery flag and final owned-child cleanup. The Linux kernel-peer workflow must actually run on Linux; its one non-Linux applicability skip is not peer-authentication evidence. Other operator tests remain enabled on all supported test hosts.


<!-- /coderabbit-ai-generated:v1 -->

## Bounded inspection cadence and monitor maintenance

The recovery service polls durable admission/recovery state every one second. Successful idle full inspections are scheduled30seconds after completion. Unsuccessful inspections or uncertain recovery use15,30,then60second waits, capped at60; the next attempt still performs exact-app restoration regardless of provider confirmation. A newly admitted run or first durable recoverRequested transition wakes a scheduled wait at the next poll. Repeated joined requests do not reset backoff. Existing active workers finish within their bounds; active Alert observation reads the recovery flag between its bounded provider polls. Workers never overlap. Startup immediately reconciles old reservations before fault admission.

Admission now requires a successful full inspection cached for at most120seconds, exact installed-source validation and independently read monitoring health matching owner/source, healthy=true and age at most65seconds. This replaces the earlier five-second-only admission proof; the old five-second readiness helper remains an internal just-completed-cycle check. Failure, corruption, boot/source mismatch, clock rollback, expired proof or stale/unhealthy monitoring closes admission. Healthy slow inspections can reuse the still-valid cached proof; expiry during an unusually long inspection closes admission until successful completion. Enqueueing does not authorize a fault: the trigger worker revalidates source, target, health, routing and suppression through its full existing preflight before stopping the app. No cache refresh is synthesized from polling. The hard cutoff and three-cycle budget remain independent requirements.

For separately authorized monitor management, first stop only the public broker (`systemctl stop deskdrop-trigger.service`) to close new admission. Keep `deskdrop-trigger-recovery.service` enabled and running. If a lease is active/uncertain or protection/app/source/health cannot be independently confirmed, leave recovery running and defer maintenance. Never stop the sole recovery owner to obtain a lock. Once no active lease and full protection/healthy exact app are proven, coordinate a protected maintainer session: acquire the existing trigger-maintenance.lock, reread the durable lease under execution.lock, and abort/release if active or uncertain. Stop the recurring monitoring service to release its lifecycle.lock, then perform the existing guarded management workflow under maintenance then lifecycle exclusion. Do not nest an external lifecycle flock around a wrapper that reacquires it; the approved wrapper takes both gates itself. Release any inspection-session gates before invoking it; broker remains stopped and the wrapper must win both locks before doing work. Independent recovery stays enabled and may retry rather than overlap. Preserve all journals and surviving installation locks; no blind removal or PID-based reclaim is permitted. If state degrades, release maintainer gates and restore monitoring so recovery can proceed. Restart recurring monitoring, verify protection/source/health and no active reservation, then restart the broker only within the approved activation window. Later activation still requires reviewed renewal.

Native Verify should exercise Schedule.step with an injected clock and real disposable custody, hold a controlled inspection in a separate process, admit once while proof is valid, persist recovery before releasing a held worker, and inspect flags/calls/cleanup. Observe repeated failed recovery attempts separated by bounded waits, plus source/health/expiry refusal. These are controlled offline observations; real systemd/provider maintenance remains a separate live gate.


<!-- /coderabbit-ai-generated:v1 -->