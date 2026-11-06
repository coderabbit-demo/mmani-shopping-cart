<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:aa86cc99e8d2e852132037a7142eb8ca1073185914532b448e1f2b07e6f38cfd -->

<!-- coderabbit-ai-generated-section:v1:db97358e3da58cd1a054a37eddf9e17f8e1f9026d3291a1b88c55aca74cbfcff -->

<!-- coderabbit-ai-generated-section:v1:5a6885488adcbaa32762e89036f28336f1b919edd65d5066c356a9e41e6deb1e -->

<!-- coderabbit-ai-generated-section:v1:cf77d85be64e411665f34691697832ddd7b275cabb12f6d932222c7c0036133f -->

<!-- coderabbit-ai-generated-section:v1:afde2061e698e4b63e37d405f619a2bb558ee6125beca8a1169a58012f3c33b5 -->

<!-- coderabbit-ai-generated-section:v1:c563dd6069a1bffd595d6825be4becbe7f861d3cf72906c2d208faf67fcd15c2 -->

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
## Updated parent checkpoint and native Verify plan

Superseding preliminary parent references above: integrated monitoring `ccaf5b89ec621a1e1f80ea6df03c11485643169b` and foundation `afbde6c9c1d946989918ce5187bae194cc1a0b68`. Retained all parent and trigger installer tests when resolving their appended-test overlap. Monitoring's stable safety inventories and healthy in-flight scheduler are preserved. Trigger suppression inventories now ignore volatile modification metadata while comparing identifiers, status, scope, schedule, message and notification-safety fields. The shared trigger-maintenance gate excludes monitor management without blocking recurring supervision's lifecycle lease. The original three monitoring review findings were reported corrected by the parent author; this task does not substitute its integration tests for that review receipt.

### Credential-free native workflow (proposed reusable fixture)

Proposed additional path: `tests/fixtures/cloud-trigger.mjs`, following the existing foundation `tests/fixtures/cloud-release.mjs` pattern. **Not added or approved by this checkpoint.** This would require an ALLOW amendment; the existing23-path brief has not been broadened. Until approved and implemented, a native agent can construct a disposable driver around the actual APIs below, but must report its own action/observation evidence rather than a unit-test summary. Do not invoke a nonexistent fixture export or claim this plan has run as native Verify.

Actual JavaScript exports are `runTrigger`, `protectionHandoff`, `verifyRouting`, `TriggerStore` from `scripts/demo/cloud-trigger.mjs`, `makeCloudApi`/`makeTriggerApi` from `cloud-monitors.mjs`, and `inspectTarget`/`verifyTarget`/`jobs` from `cloud-runtime.mjs`. Python `deploy/deskdrop-operator` is importable with `importlib.machinery.SourceFileLoader`; its actual APIs include `Custody(directory, uid)`, `Broker(custody, readiness, boot, now, authenticate, reserve)`, `Broker.serve(endpoint)`, `Broker.request(raw, uid)`, `lease(custody)`, `Host` and `Host.cycle(allow_trigger=False)`. Test injection is confined to a driver; installed public commands do not accept these parameters.

1. Record `git rev-parse HEAD`, tool versions and dirty-tree state. Create a private mode0700 temporary directory under the non-root user's home, not under world-writable ancestors. Use synthetic enrollment for the actual test UID; label it test enrollment, not OS Login acceptance. Start the actual `Broker.serve` in a disposable Python child with a socket in that directory. Keep another unrelated child alive as a cleanup control.
2. **Action:** send `status`, then malformed/extra-field and spoofed-identity requests through separate real Unix connections. **Observe/assert separately:** kernel peer UID is the real test UID; malformed requests create no lease/provider operation; claimed USER/SUDO_USER/request identities confer no authority. Do not exercise metadata, Docker or provider endpoints.
3. **Action:** release eight disposable clients simultaneously to request trigger, with one caller disconnecting after send. **Observe:** exactly one durable accepted run, remaining requests busy, same run persists after disconnect. Read only sanitized run/phase evidence. Kill the broker and reconnect to a replacement; the reservation must remain closed to new admission.
4. **Action:** call the actual `runTrigger` with a controlled in-memory provider/Docker adapter, real disposable `TriggerStore`, private monitor journal and independently recorded operation ledger. Implement only the existing documented API endpoints; reject all other requests and disable outbound networking in the driver. Seed three synthetic owned monitor IDs, one broad protection, exact source/image/isolated-network responses and one Alert-only route. **Observe:** prior persisted intent for every write, all three temporary protections before broad cancellation, only checkout unprotected, stop for the exact app ID, fresh Alert after the stop and complete restoration. Assert the intermediate ledger and durable files outside the invocation; a returned status alone is insufficient.
5. **Action:** run separate scenarios with failed suppression readback, a lost downtime POST response, stale Alert, wrong source, wrong route and a late/unknown app-stop response. **Observe:** failed suppression still produces the exact owned-app start attempt; unknown outcomes preserve intent, uncertainty and closed admission; no blind duplicate POST; wrong ownership/routing produces no fault mutation; the monotonic Alert observation stops at180seconds. The injected clock is explicitly simulation evidence.
6. **Action:** start actual `Host.cycle` in a disposable child with a controlled `invoke` boundary, kill it after the durable phase becomes recovering, then run a replacement with a different synthetic boot ID. **Observe:** it invokes recover before inspect/new admission; its flock is released by process death without deleting the lease; the unrelated child survives. Test provider-adapter hang/cancellation separately and inspect cleanup. This proves process-level behavior only, not Docker termination, systemd restart or VM reboot.
7. Cleanup only driver-owned sockets/processes/directories; retain a redacted action ledger with source SHA, scenario, pre/post phase, observed mutation names, timestamps and independent assertion results. No credentials, storage dumps or raw provider bodies. Native workflow completion must link this ledger; `npm test` output alone is not workflow acceptance.

Actual cloud OS Login denial, IAP/IAM permission, Datadog scopes/readback/intake, Docker isolation, installed systemd/firewall units and VM reboot remain unsupported by these fixtures and separately pending. The parent foundation's reusable fixture can establish source-release workflow separately; it is not a substitute for this trigger workflow. Screenshots must retain their actual sandbox/cloud provenance; reserved cloud slots remain empty. No video is required.


<!-- /coderabbit-ai-generated:v1 -->
### Integration follow-up: stale installer guard

The trigger now refuses admission while any stage14 installer container remains, including a stopped/unknown installer requiring explicit reconciliation. In recovery, that condition disables the provider adapter through a fixed trusted controller setting and still launches exact-app restoration; it cannot silently race an unfinished management write. The public protocol cannot select that setting. A controlled host-command regression proves no management refresh/provider path is taken in that case and the restoration worker is still invoked. Real flock tests also show that recurring lifecycle ownership can coexist with the trigger maintenance gate, while a competing management owner is excluded until process death releases the gate.

Raw comparison against monitoring ccaf5b8 includes three unchanged inherited foundation paths: docs/briefs/13-gcp-foundation-release.md, tests/cloud-release.test.mjs and tests/fixtures/cloud-release.mjs. They match afbde6c9 byte-for-byte. The trigger's own scope is evaluated against the combined parent tree, not by adding those foundation paths to brief15. Final publication still requires main-merged parents.


<!-- /coderabbit-ai-generated:v1 -->
### Final checks for the supplied parent interfaces

Fresh `npm test`:608 passed, exit0 (earlier merged pass606 passed). Final trigger/operator focused run22 passed, exit0; combined affected suite98 passed before the final two operator cases, covered again by the full suite. Fresh typecheck and29 unchanged goldens passed, exit0. Bash/Python syntax and diff checks passed. Prior28 checkout/persistence browser cases and17 Terraform mocks are reused after confirming their source/tests/configuration/packages/locks have no diff from4b85627. This turn did not start a browser/service or execute live systemd/provider operations.

Scope comparison against the combined published parent tree has17 trigger-owned paths, all within the23-path ALLOW list and below30. Raw monitoring-only comparison has20 paths, including the three inherited foundation files above; the unmodified scope script therefore reports those inherited paths outside brief15. No fixture path was added, no review count substituted, and no parent merge/publication gate is claimed complete.


<!-- /coderabbit-ai-generated:v1 -->
## Reusable Verify fixture implemented under the24-path amendment

This section supersedes the earlier proposed-only fixture status. `tests/fixtures/cloud-trigger.mjs` now exports `withCloudTriggerFixture(callback, {epoch, boot})` and re-exports the actual production `runTrigger`, `protectionHandoff`, `verifyRouting` functions. It imports production modules without executing their CLI guards. The fixture creates private temporary directories under the current user's home, instantiates actual guarded `TriggerStore`/`Journal` custody there and removes them on normal or exceptional exit. Every factory call starts isolated state. No provider/network/process/production CLI is invoked by the fixture.

The callback receives `actualSourceSha` read from Git separately from `synthetic.source` and other synthetic IDs; `directory`, `context`, `controls`, `clock`, `readBytes(name)`, `calls()` and `receipts()`. `context` supplies the dependencies for `runTrigger({...f.context, mode:'inspect'|'trigger'|'recover'})`. Supported durable byte names are operation.json, lease.json, route.json and installation.json; arbitrary paths, links, unsafe modes and expired custody are refused. Source SHA identifies HEAD; record `git status --short` independently for any working changes.

`controls.snapshot()` returns cloned simulated app/monitor/downtime/rule/health state. `setGroup(id, group)`, `setApp(value)`, `setRules(value)` and `setHealth(value)` let the caller select responses. No Alert or OK transition is supplied automatically. `failNext(service, method, endpoint, 'before'|'after', body)` injects an unavailable or lost response for a supported exact call. `pauseNext(service, method, endpoint, body)` returns a `reached` Promise and `resume()`; await the Promise, not a function. Unknown operations/IDs/bodies are rejected before mutation; endpoints never fall through to a live transport. `clock.read()` and `clock.set({epoch, monotonic, boot})` control only simulated time/boot. Advancing boot does not rewrite the immutable admitted lease.

Native Verify should perform these independent steps, awaiting every started operation before returning from the callback:

```js
import { withCloudTriggerFixture, runTrigger } from './tests/fixtures/cloud-trigger.mjs';
await withCloudTriggerFixture(async f => {
  const readiness = await runTrigger({ ...f.context, mode: 'inspect' });
  // Independently assert readiness.status and record f.actualSourceSha.
  const stop = `/v1.52/containers/${f.synthetic.appId}/stop?t=3`;
  const gate = f.controls.pauseNext('docker', 'POST', stop);
  const work = runTrigger({ ...f.context, mode: 'trigger' });
  await gate.reached;
  // Read operation.json; assert durable stopped intent and unknownRuntime=true.
  // Inspect snapshot: app stopped; only availability/heartbeat remain protected.
  f.controls.setGroup(701, { status: 'Alert',
    last_triggered_ts: Math.ceil(f.clock.read().epoch / 1000),
    last_resolved_ts: 0, last_nodata_ts: 0 });
  gate.resume();
  const first = await work;
  // Assert app restored but first.status remains reconciliation-required while Alert persists.
  f.controls.setGroup(701, { status: 'OK', last_triggered_ts: 0,
    last_resolved_ts: Math.floor(f.clock.read().epoch / 1000), last_nodata_ts: 0 });
  const recovered = await runTrigger({ ...f.context, mode: 'recover' });
  // Independently assert recovered, durable complete receipt, broad protection and call intents.
});
```

This is a workflow outline, not a built-in verdict. The native verifier must implement the indicated assertions and retain its own sanitized action/observation ledger. `calls()` includes copied durable operation bytes captured before each call; `receipts()` includes saved operation/installation bytes. Decode copied bytes with Buffer.from when needed. Repeat using a lost stop response: assert restoration is attempted but runtime uncertainty remains. The fixture's exception cleanup releases paused adapters, closes custody and rejects subsequent use; callers should still await/catch their operations.

The actual Linux broker/socket/process/concurrency/disconnect/lock-death tests remain separate in tests/cloud-operator.test.mjs and use the production Python APIs. This JS fixture neither substitutes simulated UID for kernel peer credentials nor claims VM/systemd/OS Login execution. Native Verify has not run merely because repository regression tests pass.

The original hard07:00Pacific admission cutoff is unchanged. Later activation needs reviewed renewal. User-reported07:10UTC account/ADC evidence remains34/46 permissions,12 not returned including project.setIamPolicy/IAP; no new check, scope acquisition or cloud write was performed here. Live readiness, screenshots and actual VM/provider gates remain pending.


<!-- /coderabbit-ai-generated:v1 -->
### Fixture amendment validation

Final focused trigger/operator suite:27 passed, exit0. Final full npm suite:613 passed, exit0. Preserved all earlier assertions and production code. New cases exercise caller-driven actual APIs and saved intent bytes, isolated simultaneous fixture instances, normal/exception cleanup, escaped/linked/expired custody refusal, unknown methods/endpoints/IDs/body/options rejection, lost-stop uncertainty with restoration and cancellation of a paused adapter. The first focused attempt exposed a test-driver misuse of the reached Promise as a function; correcting the caller produced the passing runs without weakening production guards.

A separate standalone offline workflow driver called the actual APIs and made five independent observations across142 recorded calls, including durable stop intent, checkout-only exposure, retained uncertainty while Alert persisted, explicit OK readback/recovery and custody removal. Its JSON artifact records the actual checkout SHA separately from synthetic source IDs and the working-tree state. This is offline workflow evidence, not a completed native Verify run. Existing real peer/socket/process tests were freshly included in the focused/full suites; their boot/provider injections remain explicitly synthetic. Production runtime/app/locks/pins are unchanged, so previous typecheck/goldens/browser/Terraform checks remain applicable.


<!-- /coderabbit-ai-generated:v1 -->

## Final published monitoring integration

Monitoring parent `8f91bc3a35af30979b8e28650a1ff86485fdfd2b` is integrated by merge `28e6b52f52a302b636f93c5a4c5d8b80465eb5c1` after the actual trigger fixture source `d2678968f7dce253f7a8d3410e70324b9f6b500a`. This supersedes earlier preliminary parent identities. The parent already includes foundation `afbde6c9c1d946989918ce5187bae194cc1a0b68`; neither parent is claimed main-merged or live accepted. The merge preserves the independent trigger core, fixture, cost worksheet and every parent assertion. The inherited heartbeat test waits for actual child readiness/progress, exercises both zero and700ms late startup, and awaits owned-process cleanup; this is real local process evidence, not VM boot or provider evidence. Its author's RED/GREEN and585-unit report are external receipts, not this task's execution results.

The diff against that exact monitoring parent has18 paths within the24-path brief; the three previously inherited foundation paths are now part of the base. Real source SHA is recorded separately from fixture synthetic source/boot/provider identities. Native Verify must still independently invoke the APIs and inspect durable intents/returns/calls; unit totals do not replace workflow evidence.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ef4b3024e6eb1c3665db08c71016f2f17f6c23825e56e321cc120e76b6aedaf5 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1e7b739ac0780676a7e7c3c820053de230963d94a4588d9db96a4465856e58fe -->


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

### Integration validation observed in this task

On merge `28e6b52f52a302b636f93c5a4c5d8b80465eb5c1` with the final handoff/evidence edits, Node24.22.2 and unchanged locked dependencies: `npm test` exited0 with615 passed, zero failed/skipped; `node --test tests/cloud-monitoring.test.mjs tests/cloud-trigger.test.mjs tests/cloud-operator.test.mjs tests/demo-baseline.test.mjs` exited0 with93 passed. This includes both deterministic heartbeat-delay cases and original local-demo assertions. The Mac's reported earlier parallel581/583 result and serial diagnosis are separate external observations; this Linux pass does not resolve or relabel those Mac results.

The standalone offline fixture driver exited0 with five independently asserted observations and142 API-call records. It checked readiness, durable stop intent/checkout-only exposure, restoration with health uncertainty retained, separate recovery to broad protection/complete state, and custody removal. Actual code SHA and synthetic fixture identity are separate in its output. This is not native QA Verify or cloud acceptance. Scope-gate and whitespace checks passed;18 paths against the final monitoring parent are within24 ALLOW entries. Prior typecheck,29 goldens,28 shopper browser cases and17 Terraform mocks are reused from the validation record because their source/test/config/runtime inputs are unchanged; they were not rerun. No new screenshot or live claim is made. Publication remains pending the parent-main/QA checkpoints and the Mac's one review of the whole final diff.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:dd1dc2e0cda45e5387bf8e1194049fe667950fe4cb6caa723a9616de11eaf619 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:cbd33bf8259de206d35d915d02b53a3dfd54d733770c319e2901bdefaca59aca -->


## Single Mac review correction round

The Mac completed exactly one CLI0.9.2 review on2303a0f against8f91bc3, covering18 paths and reporting two Major findings. Both were validated: the unconditional LinuxSO_PEERCRED case fails on Mac; the supervisor held the admission lock across long workers and its lock-conflict fallback falsely acknowledged recovery without persistence. This round addresses both; no new CLI review was run.

The Linux-only test has an explicit per-test platform reason; all its original assertions remain enabled on Linux. No production Mac fallback was added. In this Linux sandbox, a new real socket/process regression was RED against the old worker lock, and a separate original-source reproduction returned joined with recoverRequested=false (exit1 assertion). The corrected design uses a protected worker lock for resource execution and short journal locks for admission/read/update. Completion rereads durable lease fields, preserves concurrent recovery requests, refuses changed-run completion, and does not overwrite admissions arriving during inspection. Fresh readiness remains bounded at five seconds and failures close it. No authentication, cutoff, counter, recovery bound, management exclusion or provider boundary was relaxed. Real subprocess/socket observations and simulated controller/provider/boot state remain distinct from live VM evidence.


<!-- /coderabbit-ai-generated:v1 -->

Correction validation on Linux: `node --test tests/cloud-operator.test.mjs tests/cloud-trigger.test.mjs tests/demo-baseline.test.mjs` exited0 with78 passed; `npm test` exited0 with615 passed, zero failures/skips. This includes the fully enabled kernel-peer case, eight competing clients during blocked inspection, active-worker status/recovery and disconnect, durable early flag visibility, no lease overwrite, worker exclusion, stale-proof/denied-actor refusal and joined-process cleanup. Existing boot/death, counter/cutoff and unknown-installer restoration assertions remain passing. Original-source RED observations are recorded above; the corrected lock-conflict case refuses joined before persistence. Python AST and whitespace checks passed. The separate actual-export offline workflow passed five observations with142 calls; it is not native Verify or live VM evidence.

No Mac test run is claimed here. For the six-test operator file, the expected non-Linux applicability is five enabled cases plus exactly one Linux-only skip; actual Mac counts must come from the Mac runner. Linux CI/native Verify must observe that peer/socket test running, not skipped. This resolves the two reported Major findings in source and Linux tests; final review/PR/security/CI/native acceptance remain with the orchestrator. No additional CLI review or provider operation was performed.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3002ecf3910c30be9e338c2089d9b9fc90b82c1cbfd51a9bfd0dc86be618b8bf -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:741ac9af3fc4a3cee4c425525bf137816639373e74aa5963bd2723f31301f626 -->


## Monitoring correction25ed integration

Published monitoring `25ed7f7e766c56aa998e710ce4d902664ad9c1df` is integrated after the operator review correction `3dc5734b683fa98bb49a42f1f0f727cd9e4d8860` in merge `ea75a90d06b35017bef4ff6e26a070c01bd0c003`. This supersedes earlier monitoring-parent identities; no main merge is claimed. Read the parent's [host metadata protocol and protected-lock receipt](gcp-team-handoff.md#pr29-host-metadata-protocol-boundary-and-protected-lock-recovery). Host-only DNS UDP/TCP53 and NTP UDP123 exceptions precede the nonroot metadata deny for both named metadata addresses; HTTP/HTTPS/other protocols remain denied. A surviving installation.lock blocks before management refresh, removal or launch and retains durable intent; automatic empty-lock removal was not restored.

The appended baseline-test conflict retained both parent policy/lock tests and trigger firewall/maintenance tests. The adapted protected-maintenance fixture asserts exact trigger-maintenance.lock then lifecycle.lock acquisition order. The operator worker/journal fix, Linux peer/socket assertions and single non-Linux applicability skip, fixture bytes and cost worksheet remain unchanged. No exports, protocol or receipt shape changed, so native Verify API recipes remain applicable. Actual firewall/kernel/VM, DNS/NTP service behavior and provider gates remain pending; command-model packet observations are offline evidence only. Current IAM/IAP gaps prevent live acceptance. The November6 07:00Pacific cutoff and renewal requirement are unchanged.


<!-- /coderabbit-ai-generated:v1 -->

Fresh Linux validation: five-file focused node --test run exited0 with110 passed, zero skipped/failed; npm test exited0 with618 passed, zero skipped/failed. After strengthening only the merged injected lock-order assertion, the targeted host-management abandoned-lock test exited0 with1 passed. The full run tested the prior membership assertion; the independent targeted run covers its stricter final replacement. Original parent/trigger assertions remain. bash -n deploy/bootstrap.sh, operator Python AST parse, git diff --check and scope-gate against25ed7f7 passed. The standalone exported-API offline workflow exited0 with five observations and142 calls. Earlier typecheck,29goldens,28shopper browser and17Terraform mock passes are reused for unchanged app/TS/infra/test/config/lock/runtime inputs. No native Verify or live firewall/provider/reboot claim is made; real Linux peer/socket tests ran without a platform skip. Mac's single Linux-only applicability skip remains for its own runner to report. Root publication and final native/live gates remain pending.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a583dbae9840e26ee13e07d44cd386cf5fabbe5ec8547281927a6bc6fe800a83 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:aa8b444e112bfe96673c806009df501e5c16fa18e60aeb8bf3c06499dccff4b7 -->


## PR30 cadence and walkthrough correction

Root validated one Major cadence finding and one Minor walkthrough finding onbddda6f. Actual baseline service_main with controlled time/commands and disposable custody performed10 inspections in10 idle seconds (assertion RED, exit1); the same driver on corrected source performed1 (GREEN, exit0). The service schedules idle inspection30seconds after success and unsuccessful recovery15/30/60seconds after completion, bounded at60. Durable admitted runs or first recovery requests wake scheduled waits on one-second polling; existing active workers retain their bounds and read recovery requests during Alert observation. Independent recovery remains enabled.

The documented admission strategy uses a120second maximum full-inspection cache plus current exact-source validation and owner/source-matched healthy monitoring evidence no older than65seconds. It never renews proof merely by polling and always runs the existing full trigger preflight before faulting. Slow healthy inspection, expiry, unhealthy/source mismatch, active-worker durable flag and bounded retry behavior are observed through real owned processes/custody with controlled clocks/adapters. These are offline observations, not VM/provider or native Verify acceptance.

The walkthrough now correctly describes joined only for an active reservation and no-active-run after completion; status has installation/admission/phase/run only. Runtime/source/health/suppression proof requires independent protected/provider readbacks. The protected maintenance procedure closes broker admission, requires a complete lease and healthy/protected exact app, coordinates maintenance/lifecycle gates, and keeps independent recovery enabled. Active/uncertain state defers maintenance. The cutoff, permissions, live gates and prior assertions remain.


<!-- /coderabbit-ai-generated:v1 -->

Fresh Linux checks: node --test tests/cloud-operator.test.mjs tests/cloud-trigger.test.mjs tests/demo-baseline.test.mjs exited0 with82 passed; npm test exited0 with620 passed, zero failures/skips. The real Linux peer test remains enabled. New tests include actual service-loop wiring, separate slow-inspection/active-worker processes, durable flag preservation, no overlapping admissions, retry attempts/backoff, cached-proof expiry/current-health/source denial and joined child cleanup. Python syntax and git diff --check passed. The independent JS fixture workflow passed five observations/142 calls; no public JS fixture contract changed. Prior typecheck/29goldens/28shopper browser/17Terraform mocks reused for unchanged relevant source/test/config/lock/runtime inputs. Mac counts are not claimed; its Linux-only applicability skip is unchanged. Root's earlier firewall timeout under concurrent PDF rendering is an external result; no runtime safety bounds or assertions were changed to address it. Native QA must retarget the final source. Provider/live/publication gates remain pending.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a434f296ace2ec9cb176f67634ddb9f6b24caff881fd1e7ca3991b8df671b82b -->


## PR30 four Minor corrections after1a1fa62

The current PR review posted four Minor findings (4493424149,4493424174,4493424184,4493424194); all were validated and corrected together. Latest read-only review check shows that four-comment review completed, with no additional new inline findings. Handoff prose now consistently separates the120second inspection-cache limit,65second monitoring-health age and five-second internal completion check, with numeric/unit spacing corrected. The complete five-row Do/Say/See table retains every original action/content; generated markers are outside the uninterrupted table. Recovery explicitly retries the same request after busy until joined or no-active-run and never infers persistence from status.

The isolated service-loop fixture supplies synthetic-boot only for the exact /proc/sys/kernel/random/boot_id read, delegates every other Path.read_text and restores the method afterward. It asserts that synthetic boot reaches durable readiness and retains the original one-inspection cadence assertion. Production Linux behavior, all original assertions and the sole Linux peer applicability skip are unchanged. Simulated missing-proc execution of the actual old fixture is RED (Python exit1); corrected operator tests are GREEN. The document regression was RED because the original header block had only three action rows, and GREEN with all five contiguous rows plus explicit busy guidance. The existing CommonMark parser/HTML renderer verifies one uninterrupted pipe-table block and rendered actions; vanilla CommonMark does not implement the GFM table extension, so no vanilla-CommonMark table element or browser screenshot is claimed. Mac execution and native QA retarget remain external gates.


<!-- /coderabbit-ai-generated:v1 -->

Final fresh checks: node --test tests/cloud-operator.test.mjs exited0 with9passed, and npm test exited0 with621passed, zero failures/skips on Linux. The boot/cadence test remains enabled without a platform condition; the existing kernel-peer test ran on Linux and retains its single Mac applicability skip. Actual Mac execution remains for Root to report. No production/runtime/timing/lock/dependency/assertion changes were made. Prior unaffected production focused/typecheck/golden/browser/Terraform results remain reused. git diff --check passed. Native plans need final-head retarget; no provider/live/cutoff action occurred.


<!-- /coderabbit-ai-generated:v1 -->