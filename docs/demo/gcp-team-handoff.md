<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f2babfc9d896baf352e4346e12fa5e3a05214cc0d8e379dcd1e5197b7741829d -->

# Next phase: a shared GCP incident demo

Move the runtime and operator trigger off Mahesh's Mac while retaining the native Datadog → CodeRabbit → Slack flow and its two independent actions. Target project: `se-demos-project`; existing baseline region/zone: `us-central1` / `us-central1-a`. This is a requirements and rollout document, not an apply or deployment approval.

## Brief 13 pilot status — November 6, 2026

The foundation/release extension is described in the [cloud release runbook](gcp-baseline.md#brief-13-foundation-before-cloud-release). It reuses the merged private baseline, resource addresses and GCS backend, and separates foundation, cloud build, exact-byte publication, release plan/apply and deployment. Its keyless Cloud Build identities and immutable GCS inputs remove the Mac's image-store requirement. The legacy local controller/trigger/checker/monitor contracts remain unchanged; Linux recurring monitoring and a server-side watchdog/lease are subsequent briefs. Operator disconnect is handled by retaining execution IDs and bounded readback, never blind resubmission. Concurrent presenters remain unsupported until the server lease is implemented and verified.

Mahesh selected a **Mahesh-only pilot**, not team readiness, and approved $100 for the first seven days starting November 5. The team group/second presenter are deferred. The orchestrator reports healthy user/ADC, billing and quota, and absent named resources, but several project IAM/storage/IAP rights remain missing. No credential, role or provider operation was used in this coding task. Actual resource ownership/access must be rechecked by the authorized orchestrator before applying each real plan. Terraform/provider locks, pinned host packages and runtime isolation are retained; only the approved Ubuntu successor `20261104a` changes. Native OCI publication/worker capabilities remain fail-closed live prerequisites.

Release receipts bind source archive/generation, build/config/toolchain/OCI digests, principals/executions, explicit publication approval, readback, saved plan/input/backend/lock, prior rollback identity and host hashes. Foundation cannot deploy. Current and prior approved releases remain tagged and protected; no destructive cleanup is provided. Keyless worker accounts do not make pilot human auth or ungranted permissions disappear. Later unattended services need their own approved identities and fixtures.

GH25 is the engineering acceptance record after the real engineering Jira create 403; no fabricated SC issue is used. Exactly one Mac CLI review is pending before PR publication, then exact-head CodeRabbit PR/security/CI and conclusive native QA Verify. The four legacy external judges are not required. Sandbox browser evidence proves only the unchanged shopper flow. Private GCP/app/metadata/egress/sandbox isolation, reboot, US3 telemetry, publication and team/disconnect/competing-presenter acceptance require their separate real fixtures. Preserve all existing scenario requirements; no local substitute proves live acceptance.

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

1. Review bootstrap and demo plans separately, including the actual state principal, globally unique bucket name, backend/prefix and recovery custody. The GCS backend supports state locking; enable object versioning and test restoration before multiple operators use it.
2. Resolve the actual team group and runtime/deployer/state-operator identities. Review resource-level IAM, service-account impersonation and organization policies. Do not create downloadable service-account keys for presenters.
3. Review the actual project, quota, region/zone, network overlaps, NAT egress, private Google access where applicable, firewall rules and OS Login/IAP permissions. Retain no-public-app-ingress and metadata/host isolation acceptance.
4. Verify current availability of every pinned VM/package/image artifact before the plan. Any pin/provider change needs an explicit brief and ALLOW authorization; do not silently upgrade a baseline that was reviewed with different versions.
5. Review images by immutable digest, source commit and SBOM/provenance where available; publish only after the separately approved image/deployment step. Preserve rollback tags and inspect registry cleanup behavior before enabling deletion live.
6. Create secret containers with Terraform and enroll values privately outside Terraform state. Keep the Agent intake key separate from a narrowly scoped Datadog management key used by the trigger. Decide which trusted control process can access that management secret; it does not belong in app/checker containers, image layers or startup metadata.
7. Produce a dated cost worksheet with owner, duration, budget alerts, review cadence and stop/teardown procedures. The existing [cost worksheet](gcp-costs.md) is incomplete and its historical rates need rechecking. Budget notifications are not a hard spending cap; the standing absence of a coding-agent cost cap is not cloud-spend approval.
8. Review saved plans, rollback and destroy plans before any apply. Keep bootstrap/state custody separate from ordinary demo teardown, and preserve shared APIs and unrelated IAM resources.

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

The phase is team-ready only after an operator other than Mahesh completes the end-to-end rehearsal and reset without using his Mac, local credential files, browser session or personal tokens. Record remaining limits explicitly. Do not present Terraform validation, mocked checks, sandbox QA or the local SC-41 run as live GCP acceptance.

## Primary references

- [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding) for private VM access and target permissions.
- [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs) for state locking, existing-bucket requirements and recovery recommendations.
- [Secret Manager access control](https://docs.cloud.google.com/secret-manager/docs/access-control) for least privilege and Compute Engine scope requirements.
- The existing [private baseline runbook](gcp-baseline.md) and [cost worksheet](gcp-costs.md) remain the detailed deployment references.


<!-- /coderabbit-ai-generated:v1 -->