<!-- coderabbit-ai-generated:v1 -->

# GCP trigger independent implementation checkpoint

This is offline source/process evidence, not a completed installation or live cloud acceptance.

## Source

Approved base: `e47b5a6df74df8b5199f4f45f2a56d5f601d63e2`, including partial monitoring `9faa889a2009d1b2fa1ec22951eba246a5307816` and its foundation snapshot. Those inherited changes are not this task's implementation and are not presented as final reviewed integration.

## Implemented independent contracts

`deploy/deskdrop-operator` provides the Python client, peer-UID broker, protected enrollment reads and durable single-run admission. The public argument grammar is exactly `status`, `trigger` or `recover`. The intended installed path is `/usr/local/bin/deskdrop-operator`; it is not installed by this checkpoint. Broker methods are internal Python APIs, not public command modes. Root-owned enrollment must be supplied only after independently verified OS Login enrollment; no enrollment or grants have been performed. UID/name revalidation uses the OS account database, while the immutable subject binding comes from the protected enrollment record. This alone is not live OS Login attestation.

The public socket is intended for unprivileged clients and authenticates every connection using Linux SO_PEERCRED. It is distinct from private directories0700/files0600. The broker durably records a run before acknowledgment, keeps incomplete reservations across process death/reboot, rejects clock rollback and stops admissions at November6 2026 15:00 UTC (7AM Pacific). Recover requests join the same outstanding run. This checkpoint does not connect readiness to live receipts or execute a fault.

`cloud-trigger.mjs` implements independent bounded recovery orchestration against injected operations. It always attempts exact-app restoration after provider suppression failure. It retains uncertainty and releases only after adapter fencing, source/health and suppression confirmation. The future adapter must validate ownership, persist durable operation intents, terminate outstanding owned children and hold the execution lock through confirmed fencing; an AbortSignal alone does not prove a provider mutation stopped.

## Verification

Seven focused tests pass using Node24.22.2 and Python3.14 on this Linux sandbox. Real Unix sockets exercise kernel peer UID and disconnected-client survival; eight real competing processes produce exactly one admission. Killing and restarting a broker preserves the lease. Kernel-lock owner death releases the lock without erasing the reservation. Spoofed environment/identity, extra arguments, duplicate protocol fields, unsafe modes, links, corrupt journals, wrong enrollment, expired admission window and clock rollback are rejected. Recovery tests cover failed suppression with app restoration, wrong app/source, uncertain release, failed fencing and bounded hung operation abortion. The initial Python3.14 forkserver fixture failure was corrected by explicitly using the Linux fork context, preserving all assertions. These tests require Linux and an unprivileged test account; they do not prove Ubuntu24.04 deployment or VM reboot.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f41a97de62af4d348e2e4a4470d12816924253352adc9d1df45504808db898a9 -->

Full `npm test` passed553 tests (exit0); `npm run typecheck` passed (exit0); `npm run golden:check` matched all29 unchanged goldens (exit0). The final focused run also covers added clock-rollback and repeated recovery assertions. No shopper or Terraform source changed in this checkpoint; final affected browser/Terraform integration checks remain pending the final dependency source.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1dc0d7318bd615827be31f370bccfb91aeef8aebc7d7052dcc89c190f1ebda01 -->

## Provenance and pending live evidence

The [dated cost worksheet](gcp-costs.md) is a source-based illustration, not a billing or deployment receipt. This coding work has started no GCP consumption. First consumption, actual spend, start/stop timestamps and deadline remain unobserved.

The maintainer reports foundation PR28 open at `9e5700d46770ffd6be9add66c8141007f2bf7663`, with Mac unit and CI checks passed and review/Verify underway. It is not merged or a completed deployment. Monitoring's published partial source remains `9faa889a2009d1b2fa1ec22951eba246a5307816`; final executable interfaces and integration are pending. Record the actual reviewed source and image digests, saved plan/input/backend/lock hashes, installation and runtime receipts when independently observed. Do not treat these source checkpoints as live cloud acceptance.

The approved screenshot slots are reserved for actual, separately authorized observations of status, recovery and native actions. Record each capture's date, source and matching event/receipt when available; all three remain pending and have no placeholder images. Live private access and denied presenter, monitoring intake, native actions, reboot, recovery and publication gates remain pending. Native Jira and Debug are independent; Debug investigates the repository without a Jira prerequisite.

## Remaining dependency integration and gates

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

Await the maintainer-supplied reviewed final foundation and monitoring source. Do not invent their release/host bundle, runtime reservation, suppression or monitor lifecycle fields. Remaining work includes executable boot services, pinned-controller adapter wiring, durable worker recovery integration, complete fault/Alert execution, source-bound installation, enrollment/live permission validation and final runbooks. Final affected/full tests, Terraform checks and native QA apply after that integration. The Mac's single completed CLI review is reserved for the whole completed diff; none ran here.

No GCP/Datadog/Slack/Jira credentials or provider operations were used. Actual cloud screenshots remain absent. Private IAP/IAM authority, denied-presenter metadata/access, native intake/buttons, actual reboot and three-cycle-bounded rehearsal are separate live gates. Mahesh admin access is not team acceptance. PR23 remains unmerged and the bridge paused. Debug and Jira remain independent; no intentional app-stop is treated as a product defect.
