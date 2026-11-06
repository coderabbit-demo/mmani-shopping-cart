<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b8cef0b408f1af2f7710018de84b9911b130ab11f92256e880fb6ab5fb8a4c4a -->

<!-- coderabbit-ai-generated-section:v1:4c28ff002d834a0ed9a66fcaf14381dd59a9901a9abed4a8254931c797393109 -->

# GCP trigger preliminary integration evidence

## Source and status

This is source/offline/sandbox evidence. It is not live cloud acceptance or final parent integration. The task merged published monitoring `ae0e7cd7724d4b500ab4906a4bd3d5cd65385912` into its prior core/cost checkpoint `4b79bf3747259cc706792d6bddbb40e9e15f6be0`, producing merge `edb04e9e129cf8edb55e5c673e27e6ec8d73eb2a`. The monitored snapshot includes foundation `5e40a573e7f6554e33e91f71c09acf3ecbd26f5b`. Foundation PR28 at `9e5700d46770ffd6be9add66c8141007f2bf7663` and its pending reusable QA adapter are not represented as merged. Final merged foundation and monitoring heads must be integrated before final review/publication. The final checkpoint SHA and exact path receipt are reported by the task after commit.

The root Python client/broker, service modes, source-bound bundle installer, pinned Node controller adapter and durable protection handoff now have executable source. The installed public helper accepts exactly `status`, `trigger`, `recover`; service/enrollment modes require root and are unavailable over its public protocol. Kernel SO_PEERCRED is the caller identity. NSS plus the metadata OS Login mapping revalidates the root-enrolled Mahesh principal. Actual cloud enrollment and denied-presenter acceptance have not occurred. The trusted recovery container uses Docker's Unix socket API, not an assumed Docker CLI or host Node. Its management mount is absent from recurring checks/storefront.

Recovery is independent of client/broker lifetime, serialized by host flock and durable run state. Boot admission begins closed. Worker failure is followed by an independent recovery invocation; stale exact-owned controller containers are fenced before a new invocation. Recovery attempts owned-app restoration even when metadata/provider confirmation is unavailable; a failed identity check still prevents reporting recovered. Unknown writes and ambiguous inventories keep the reservation uncertain. A durable counter reserves no more than three cycles, and the original November6 15:00UTC fault-admission cutoff remains unchanged.

## Published API contracts and integration changes

Stage14's original installation remains one active broad owner-selector downtime for all three monitors. The trigger stores its own migration journal: create and confirm three temporary exact-monitor downtimes; prove effective coverage before canceling broad suppression; cancel only checkout's guard. Recovery restores a broad guard before removing temporary guards and updating the existing stage14 protection ID. Unknown POST absence is not retried. Other effective matches or unexpected ownership prevent admission.

The original `makeCloudApi` retains its install-focused whitelist. `makeTriggerApi` adds **GET only** for `/api/v1/monitor/<id>?group_states=all`, `/api/v2/monitor/notification_rule/<id>`, and bounded `/api/v2/monitor/notification_rule?page=<0..10>&per_page=100&sort=name%3Aasc`. No monitor update or routing mutation is added. The existing downtime POST/GET/DELETE operations implement the protected handoff. An actual separately approved cloud rule and recipient must already exist. Complete stable inventory, exact owner tags and Alert-only conditional recipients are required; unsupported filter expressions fail closed.

Primary contract sources inspected: Google's [guest OS Login implementation](https://github.com/GoogleCloudPlatform/guest-oslogin/blob/master/src/oslogin_utils.cc) (`users?username`, `loginProfiles`, subject name and POSIX mapping), and Datadog's [Monitors API implementation](https://github.com/DataDog/datadog-api-client-typescript/blob/master/packages/datadog-api-client-v2/apis/MonitorsApi.ts) (notification-rule GET detail/list and pagination). These source reads and injected-response tests are not a live provider contract confirmation. The managed web-source reader was unavailable (401); public upstream source downloads succeeded without credentials.

`inspectTarget` validates the same app/source/isolation before inspecting stopped state. Existing `verifyTarget` still requires a running app. A confirmed stopped owned app produces a failed recurring check, allowing controller/heartbeat recurrence through the deliberate fault; incorrect identity still rejects. No local monitor IDs, local command defaults, image pins, manifest/lock, shopper source or golden assertions were changed.

## Observed offline checks (2026-11-06 UTC)

- `node --test tests/cloud-trigger.test.mjs tests/cloud-operator.test.mjs tests/demo-baseline.test.mjs tests/cloud-monitoring.test.mjs tests/cloud-monitors.test.mjs`: 89 passed, exit0. Earlier intermediate focused suites passed77 and18 tests as coverage grew; the final new-feature run passed19 tests including the monotonic180second observation bound.
- `npm test`: final593 passed, exit0; earlier integration pass590/590. Existing assertions retained. Linux socket tests use actual kernel peers and eight competing processes; exactly one admission survives disconnect. Killed broker/lock owner/supervisor tests retain reservations, recover before fresh admission, and preserve an unrelated process. Boot IDs and clocks are synthetic where stated, not a VM reboot.
- Actual trigger adapter fixtures prove checkout-only exposure, uninterrupted other-monitor coverage, fresh Alert evidence, broad suppression restoration, app start despite failed provider readback, uncertain-stop retention, wrong source/routing/health denial and stopped-app recurring checks. Unknown/absent creates, extra effective suppressions, changing inventories, rejected rule updates and enrolled Alert-only routing are exercised.
- Actual host installer code runs against disposable paths with process boundaries injected: all helper/unit/source hashes are checked, a repeated bundle preserves durable state, and a corrupt transfer is rejected before installation commands. No host service was installed here.
- `npm run typecheck`: exit0. `npm run golden:check`: exit0, all29 unchanged goldens matched. Bash syntax and Python AST parsing passed.
- Terraform1.15.3 (the repository's existing pin) was installed locally through mise for validation. `terraform fmt -check -recursive infra`, backend-disabled read-only-lock init and validate passed; sanitized mock tests passed4 bootstrap and13 application cases, exit0. No ADC/provider secrets or live plan/apply were used. Provider locks are unchanged.
- Managed repository startup built the current checkout and reported port3100 ready. Existing checkout/persistence Playwright cases ran against that process through a task-local config outside the repository:28 passed, exit0. Shared cloud Chromium opened the real sandbox storefront. The managed app was stopped afterward and port3100 was confirmed closed. These checks preserve the $97 checkout/receipt/both-history-item assertions; no screenshots are claimed as cloud evidence.
- `systemd-analyze verify` exited1 because this sandbox lacks deployed `deskdrop-firewall.service`. This is a blocked deployed-service check, not evidence of successful systemd or reboot execution. Bash/Python syntax and service-source tests do not replace that gate.

The workspace validation record holds exact input hashes, commands and reuse boundaries. The Mac's single completed review remains reserved for the whole final integrated diff; no provider or live rehearsal action was performed by this coding task.

## Live gates and evidence still pending

Required: final merged parent source, exact-head review/security/CI and native QA; actual reviewed images and saved plan/input/backend/lock receipts; private deployment and current IAM/IAP authority; actual OS Login enrollment and denied non-admin/presenter metadata/socket/host access; source-bound VM installation; complete effective routing/suppression readback; fresh US3 intake and checkout Alert; caller/Mac disconnect, systemd process restart and real VM reboot recovery; native Jira and Debug actions; and authorized publication. Existing Editor/admin access does not prove these permissions or team isolation. Team group/tester is deferred.

The [cost worksheet](gcp-costs.md) retains the $14.193528 priced illustration plus$20 unpriced reserve and$10 contingency=$44.19 allocation against the approved$100 allowance. It is not a complete quote, guaranteed cap, actual spend or readiness. This work started no GCP resource/consumption; no start/stop timestamps or actual spend have been invented.

All three reserved cloud screenshot slots remain absent until separately observed high-resolution evidence exists. Record actual capture time, source/runtime identity and event/receipt provenance; no placeholders, generated images or relabelled sandbox screenshots. Videos are not required. Native Jira and Debug remain independent in either order. Debug investigates actual source without Jira references or prerequisites. Deliberate app-stop does not establish a product bug. The package remains at most three live cycles, one synthetic incident Bug and one isolated unmerged native fix PR. PR23 stays unmerged and the custom bridge paused. Existing private-infrastructure/reboot/telemetry/publication scenarios remain pending, not replaced by local QA.


<!-- /coderabbit-ai-generated:v1 -->