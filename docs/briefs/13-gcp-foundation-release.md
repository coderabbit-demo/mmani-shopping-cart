# Brief 13: `feat: GCP foundation and reproducible cloud release`

**GitHub:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/25

Parent work package: https://github.com/coderabbit-demo/mmani-shopping-cart/issues/24

## Authorization and outcome

Mahesh approved the bounded GCP execution package on November 5, 2026, delegated routine brief/plan/scope/review/merge checkpoints to Codex, selected a Mahesh-only pilot and approved up to $100 of Google Cloud use for the first seven days. Use only the permissions currently available to mahesh@coderabbit.ai; document any additional requirements rather than acquiring broader privileges or inventing a deployer identity. Target pilot readiness is November 6 at 7 AM Pacific. Coding-agent time/cost remains uncapped.

Implement the first stage of the existing CodeRabbit migration plan: https://app.coderabbit.ai/code/tasks/3fc4ef30-746d-4ef7-acbf-fd30d47ee72d . Reuse the existing private baseline, Terraform state addresses and backend. Separate foundation provisioning from immutable build/publication/release/deployment so the registry can exist before Cloud Build builds images, without a fake image digest or weakened deployment gate. This coding task performs implementation and offline validation only; the Mac orchestrator separately reviews and executes live plans under the approved package.

## Assumptions verified by the orchestrator

- PR #22 passed its current-head strict gate and merged as main commit 0f0c42fcff214a8b8fbfd5ee5813d79d351dd94c. Rebase the clean task onto that merged source before implementing. PR #23 and the paused custom-bridge repair are unrelated and remain unmerged/paused.
- Google user and ADC authentication work; ADC quota project is se-demos-project. Project number 281328756000 is ACTIVE with billing enabled. Region us-central1 and zone us-central1-a are UP. The fixed e2-standard-2 shape is 2 vCPU/8 GiB; observed regional CPU/E2/instance/disk quotas are sufficient for one instance, without a capacity reservation.
- Named DeskDrop VM/VPC/subnet/router/firewall/registry/runtime-SA/intake-secret/state-bucket resources were not found. Do not treat this as permanent name reservation, successful apply or authority to recreate ambiguous existing resources.
- IAP and Cloud Build APIs are not enabled. Existing account permission tests did not grant project-scope IAP tunneling, several IAM policy writes and state-bucket/object permissions. Resource-level/conditional grants must be tested against actual resources if created. Permission failure is a documented deployment blocker, not authorization to grant Owner/Editor, use another user's credentials or weaken private access.
- Existing Terraform is exactly 1.15.3, Google provider exactly 8.10.0 with lockfiles. The Mac has Docker 29.9.2, Buildx 0.38.1 and containerd image store; these facts do not establish Cloud Build worker capabilities.
- Existing Node/Playwright/Datadog manifests are readable at their pinned digests. All five Ubuntu noble amd64 Docker host package versions and SHA256 values match the official package index and reviewed bootstrap.
- The original Ubuntu image ubuntu-2404-noble-amd64-v20261024 is READY but DEPRECATED. Its named successor projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261104a is READY, X86_64 and has no returned deprecation marker. Only this VM-image pin amendment is authorized; preserve other runtime/provider/package pins.
- An isolated read-only, networkless, mountless probe of the official Google builder reported Docker 20.10.24 and Buildx 0.23.0, plus tar/bash/python3 and no Node binary. This is not Cloud Build worker or export proof.
- Official candidate gcr.io/cloud-builders/docker@sha256:91eaff0806a70dc0b3c853191a2da9995b2aa88d9b24196182344a4cef633603 has a readable linux/amd64 manifest/config and Docker entrypoint. Binary capabilities, OCI export and Cloud Build worker behavior are not yet proven. No mutable execution tag or fallback installer is allowed.
- Google documents native Cloud Build artifacts.oci publication as well as user-managed build identities. Evaluate digest-preserving native publication before adding a publisher dependency. Actual worker/export/publication behavior remains live acceptance, never a fabricated offline result.
- Root application remains Next.js 16/React 19/TypeScript 7/npm/Node >=22.6/localStorage-only. Preserve all six cart rules, every existing assertion and all goldens. No npm, root manifest, CI or provider lock changes are allowed.

## Required foundation and release contracts

1. Retain infra/bootstrap and infra/terraform, current resource addresses, fixed se-demos-project/us-central1/us-central1-a targets and deskdrop/demo backend prefix. Do not create a second stack or use routine -target. State bucket is se-demos-project-deskdrop-tfstate with private/versioned state and separate protected bootstrap custody.
2. Add an explicit foundation phase that legitimately lacks release image identity. Foundation tfvars/plan/applied receipts are typed and cannot satisfy release, publication, host-install or deploy prerequisites. Existing valid baseline behavior must remain supported. Reject zero/fake digests and mismatched phase receipts.
3. Foundation provisions the private baseline and only necessary dedicated Cloud Build build/publisher identities and private source/artifact/log storage. At most two additional build/artifact/log buckets; no public VM/app port, no broad default build identity and no service-account keys. Preserve OS Login, Shielded VM, IAP-source SSH and existing Docker/metadata/egress isolation requirements.
4. Source archive binds repository/full commit/archive hash and immutable GCS generation. Build receipt binds config/toolchain digests, expected service identity/execution ID, architecture, app/checker manifest/config digests and protected artifact hashes/generations. Separate build and publisher permissions; build has no registry-write/deployment/Datadog/runtime-secret access.
5. Build into protected OCI artifacts. Publication requires explicit approval for the exact artifacts/digests, imports or publishes the same bytes without rebuild and verifies final registry digest equality. A partial or unknown publish is reconciled by bounded readback before retry; never report fabricated success or erase uncertain evidence.
6. Release-bound plans and deploy prerequisites require the real owned immutable app/checker identities, source and verified foundation/build/publication receipts. Preserve plan/input/backend/lock/source and host-file hashes and write-once/protected receipts. Wrong image, architecture, registry, config, principal or source blocks execution.
7. Retain a tagged current and prior approved rollback release. Cleanup must not remove the last approved rollback artifacts; ordinary teardown must preserve state custody, shared APIs and unrelated IAM/resources. Record the difference between an unconfigured foundation VM and a deployed healthy app.
8. Permit Cloud Shell/other approved operator execution without Mahesh's Mac, personal browser or local Docker image store. Do not transfer Google CLI/browser tokens into a sandbox/VM/container. No dependency on the Mac's containerd image store may be assumed for the cloud publisher.
9. Capability guards run before build/publication mutations. Unsupported builder/worker/export/import behavior fails closed. Resolve and record exact official toolchain pins before execution. If a new pin or cloud capability must be verified by the orchestrator, report it while continuing independent in-scope implementation/tests; never replace it with latest or a silent installer.
10. CodeRabbit tasks use no live GCP/Datadog/Slack/Jira credentials or provider writes. Tests use fakes/mock providers/owned temporary processes only. Live permission failures remain specific documented blockers while offline implementation can complete.

## Dependency allowances

- ALLOW: dependency VM image projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261104a, limited to matching Terraform/runtime-version values and regression coverage.
- ALLOW: dependency gcr.io/cloud-builders/docker@sha256:91eaff0806a70dc0b3c853191a2da9995b2aa88d9b24196182344a4cef633603 only after the required isolated capability validation supports the selected path.
- ALLOW: dependency at most two additional official Docker Buildx/BuildKit toolchain images if needed, exact upstream version/digest recorded in deploy/cloudbuild/toolchain.json and independently verified before use. Propose those exact pins to Codex for the delegated verification; no npm dependency or mutable execution tags.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f55ca3e93645ce34ef16fe75ff15066fb57cc1e2b8ff021fd7e59113913d112a -->

### Delegated toolchain pin verification — November 6, 2026

The orchestrator supplied and approved these two official linux/amd64 image pins under the existing at-most-two-image allowance. Probes used no network, mounts or socket and a read-only filesystem, after immutable amd64 pull verification. These are supplied binary observations, not probes executed by the coding task.

- ALLOW: dependency `docker.io/library/docker@sha256:b0d99f37f463c88cae2082083f705210296186c06632d22f6952ed43506ae520`. Registry annotation `29.9.3-cli`; upstream `docker-library/docker` revision `3e782bbabff3af541d2699cf62bd25ec12d3feb6:29/cli`. Observed Docker `29.9.3` build `5457199`, Buildx `0.38.2` revision `3c4cbd35852fc1a476923627a780a7836c28b654`, tar/sh.
- ALLOW: dependency `docker.io/moby/buildkit@sha256:97719ccb2ac86fb44fd36f330a6d302f63dddd5326f3ada24f9c05ccac0d9098`. Observed buildkitd/buildctl `0.34.2` revision `8c579433824224dc64a158cf8734495b6e2b186a`, tar/sh.

Use the current Docker CLI with an explicitly pinned docker-container BuildKit driver for OCI export; no fallback to the old Google Docker20.10 client, mutable driver image or silent installer. The existing pinned Node image still validates/stages OCI bytes. No extra publisher dependency is approved; native `artifacts.oci` publication remains the selected design. Actual Cloud Build worker/driver compatibility, OCI export, native publication and final registry digest equality still require fail-closed live probes before the corresponding mutations. Binary receipts cannot satisfy those capability guards. Preserve phase/approval/principal/ownership boundaries.


<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fba904fca29887f83e5302b5d62999e89b8fdc357a0d3b5071d5acbaa3405b31 -->

## Exact approved file scope (22 paths)

```text
ALLOW: docs/briefs/13-gcp-foundation-release.md
ALLOW: infra/bootstrap/main.tf
ALLOW: infra/bootstrap/tests/state.tftest.hcl
ALLOW: infra/terraform/main.tf
ALLOW: infra/terraform/variables.tf
ALLOW: infra/terraform/outputs.tf
ALLOW: infra/terraform/terraform.tfvars.example
ALLOW: infra/terraform/tests/baseline.tftest.hcl
ALLOW: infra/terraform/team-release.tf
ALLOW: infra/terraform/tests/team-release.tftest.hcl
ALLOW: deploy/cloudbuild/build.yaml
ALLOW: deploy/cloudbuild/publish.yaml
ALLOW: deploy/cloudbuild/toolchain.json
ALLOW: scripts/demo/baseline.mjs
ALLOW: scripts/demo/cloud-release.mjs
ALLOW: tests/demo-baseline.test.mjs
ALLOW: tests/cloud-release.test.mjs
ALLOW: tests/fixtures/cloud-release.mjs
ALLOW: docs/demo/gcp-baseline.md
ALLOW: docs/demo/gcp-costs.md
ALLOW: docs/demo/gcp-team-handoff.md
ALLOW: deploy/runtime-versions.json
```

No app/lib/component source, root manifests/lockfiles, goldens, existing host package pins, provider locks, unrelated workflow or paused bridge edits. Keep the whole main-targeting PR under 30 paths. Report any necessary amendment before editing it; Codex may review routine cloud-only amendments under the delegated bounds.

## Offline native Verify contract (PR28 follow-up)

Approved amendment: https://github.com/coderabbit-demo/mmani-shopping-cart/pull/28#issuecomment-6678461109 . The fixture extraction adds only `tests/fixtures/cloud-release.mjs`; the existing test file and this brief remain allowed. The whole PR is expected to contain 20 changed paths, below 30. No production, Terraform, CI, dependency, storefront or golden change is authorized by this amendment.

Native Verify may independently exercise the exported production APIs with the test-only provider. Importing the fixture registers no tests and executes no commands. `withCloudReleaseFixture(callback, { mode: 'empty' })` supplies a canonical, owned, private, fresh temporary directory and removes only that directory in `finally`, including when the callback fails. It never writes the default production artifact/state directories. `mode: 'seeded'` (the default) preserves existing release-unit setup; it pre-seeds foundation/source/capability evidence and therefore cannot establish foundation lifecycle coverage. Use empty mode for that scenario.

The callback supplies `artifacts`/`dir`, `cloudRoot`/`root`, `baselineContext`, `statePath`, `actualCheckoutSha`, `synthetic`, `write`, `run`, `provider`, and `calls`. Record `actualCheckoutSha` as the implementation under test. `synthetic.commit` and `synthetic.executionId` identify synthetic source/job data only. Synthetic approvals, state, capability observations, OCI contents and registry readbacks are never genuine bootstrap approval, worker capability, publication or GCP evidence.

### Supported invocation and independent observations

Run a Node ESM driver from the repository root, importing the modules below; do not invoke the production command-line entrypoints or omit the injected `run`/context. Verify writes its driver outside the checkout or uses `node --input-type=module`. Node's optional permission mode without `--allow-child-process` can provide an additional subprocess prohibition for that driver; the adapter itself contains no subprocess/socket/network execution.

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withCloudReleaseFixture } from './tests/fixtures/cloud-release.mjs';
import { action as baseline } from './scripts/demo/baseline.mjs';
import { cloudAction, prepareRequest } from './scripts/demo/cloud-release.mjs';

await withCloudReleaseFixture(async f => {
  const { write, run, baselineContext: ctx, provider, calls } = f;
  console.log({ testedCheckout: f.actualCheckoutSha, synthetic: f.synthetic });
  await write('bootstrap-state.json', { statePath: f.statePath });
  await write('bootstrap.tfvars.json', {
    project_id: 'se-demos-project',
    bucket_name: 'se-demos-project-deskdrop-tfstate',
    state_operator: 'user:offline@example.invalid'
  });
  const plan = await baseline('plan', ['bootstrap'], run, ctx);
  await assert.rejects(baseline('apply', ['bootstrap'], run, ctx));
  await write('bootstrap-approval.json', {
    planHash: plan.planHash, permissionsChecked: true,
    stateCustodyConfirmed: true, costApproved: true,
    owner: 'offline-fixture-only', teardown: 'discard synthetic fixture'
  });
  provider.failNext('terraform.apply', 'independent synthetic denial');
  await assert.rejects(baseline('apply', ['bootstrap'], run, ctx));
  const result = await baseline('apply', ['bootstrap'], run, ctx);
  assert.equal(result.status, 'applied');
  const receipt = JSON.parse(await readFile(`${f.artifacts}/bootstrap-applied.json`));
  assert.equal(receipt.planHash, plan.planHash);
  assert.ok(calls.some(c => c.kind === 'terraform.apply' && c.outcome === 'fault'));
}, { mode: 'empty' });
```

Continue in the same callback for foundation: write the fixed foundation tfvars (project/region/zone/environment/phase), call `baseline('plan', ['foundation'], run, ctx)`, independently test denial without approval, then explicitly write a fixture-only approval bound to the returned plan and call apply. Inspect the receipts and actual synthetic saved-plan/input bytes; the provider does not generate application approval or phase verdicts.

For release coverage, use the actual `cloudAction('source-archive', ...)` and `verify-source` with `f.source` as synthetic source metadata. `f.seedCapabilities()` and `f.stageBuildArtifacts()` explicitly stage synthetic worker inputs; first observe rejection without them. Prepare requests with `prepareRequest('build', f.artifacts, f.cloudRoot)`, write the returned request and an explicitly synthetic `execution(request)` result (exported by the fixture), then call `cloudAction('record-build', ...)`. Independently supply the separate synthetic publication approval; call the production `bundle`, `verify-publication-source`, `prepareRequest('publish', ...)`, `record-publication`, and `release` operations. Finally invoke baseline release plan/apply/host-install/deploy with the same context. The legacy `build`/`publish` convenience helpers remain for existing seeded unit cases; independent Verify should choose its own actions, mutations and approvals rather than treating those helpers as a verdict.

### Provider controls and boundaries

- `provider.putObject('gs://.../object#generation', Buffer)` / `removeObject(uri)` control exact synthetic source/artifact object inventory. Register the actual production bundle bytes read from the owned directory before publication-source verification. No upload or external request occurs.
- `provider.setImage(fullDigestOrCommitTagRef, { digest, fully_qualified_digest })` / `removeImage(ref)` control exact owned-registry readbacks. Test missing checker, wrong digest and recovery independently.
- `provider.setGit({ head, status, archive })` changes synthetic Git responses; `archive` is a Buffer. Test dirty/different source identities before restoring them.
- `provider.failNext(kind, message)` injects one fault after supported-command validation. Kinds: `git.head`, `git.status`, `git.archive`, `storage.cat`, `registry.describe`, `terraform.plan`, `terraform.apply`, `compute.scp`, `compute.ssh`.
- `provider.setRemote(commandText, timeout, output)` registers an exact synthetic SSH response for 600000/1800000ms operations. SSH rejects until explicitly registered. Inspect its captured fixed project/zone/VM/IAP arguments and expected hash-bound command text before registering a response; never auto-approve arbitrary captured commands. The text is never executed. SCP supports only the existing fixed bootstrap/compose transfer arguments.
- `write(filename, value)` supports a single receipt filename inside the owned artifact directory. Canonical custody rejects traversal, symlinks and hardlinks. Direct filesystem mutations chosen by Verify must likewise stay inside its owned fixture tree.
- `calls` records attempted file/args/options plus `kind` (when supported) and `outcome` (`returned`, `fault`, `rejected`). Unknown programs, arguments, options, escaped paths and unregistered remote commands fail before simulated mutation. No real command fallback exists. Inventory controls do not mirror production receipt/approval/hash/phase validation.

Observe valid ordering and rejected tampering of source/generation, OCI, principal, approval, plan/input/backend/lock/applied receipts, plus partial/unknown publication and cleanup. Examine production return values, generated receipts and captured calls directly; unit-test output is supplemental evidence. Snapshot relevant evidence within the callback before automatic cleanup. Do not record storage or credential dumps.

The nested baseline release verifier currently calls `cloudAction('verify', ...)` with its default runner, but that action performs filesystem-only validation. The regression intercepts the real default subprocess boundary, proves interception works, and requires zero default-runner calls throughout the injected release lifecycle. Production changes would need a separate amendment if this ceases to hold. The distinct owned-builder shell test still executes the actual POSIX script against its disposable fake Docker executable and retains every cleanup assertion.

An offline Verify pass establishes exported orchestration/API behavior only. Actual Terraform resource/private-network assertions remain their own CI category. Real worker/OCI/native publication compatibility, IAP, private-cloud isolation, reboot persistence and intake acceptance remain separately authorized live categories. No real cloud credentials or production approvals are required or permitted for this offline plan, and a local pass cannot replace those pending requirements.



<!-- /coderabbit-ai-generated:v1 -->

## Required observable tests and validation

- Foundation can be planned without a release, but cannot publish, install or deploy. Existing valid baseline releases continue to work; fake/zero/null release identity and wrong-phase receipts are rejected before mutation.
- Reject tampered source archives/generations, config/toolchain/OCI blobs, plan/input/backend/lock/applied receipts, source labels, identities, registry or architecture. Preserve all existing assertions and meaningful regression RED/GREEN for changes to existing behavior; do not manufacture RED by importing absent new modules.
- Separate build/publication/deployment authorization and principals. Cover unknown/partial publication, readback reconciliation, bounded child/process cleanup, receipt secrecy and rollback preservation. Fakes must assert exact commands, targets and absence of unauthorized writes, not merely import modules.
- Terraform mock tests retain private networking, no external VM IP/public app ingress, correct IAP/OS Login/runtime scopes, least-privilege resource IAM, private/versioned state and shared API preservation. Verify the matching explicit VM pin in Terraform and runtime versions.
- Run focused baseline/cloud-release tests, complete npm test, typecheck, unchanged golden checks, and Terraform fmt/validate/mock tests using sanitized environments. Reuse unchanged shopper browser/build evidence only with an explicit source-identity rationale; CI still runs its configured suites.
- Exactly one completed CodeRabbit CLI review for this new task. The task may complete it once and report base/head/result, or defer the single run to the Mac harness. Do not start an additional CLI review in a PR-fix round. Native coding has no CLI authoring-auth prerequisite.
- Before PR publication, report the implementation commit/base, exact paths, test receipts and all finding dispositions; push the implementation branch for Mac review, then wait for the orchestrator's CLI receipt. Root uses the repository PR helper after validation. PR description starts with Fixes plus the raw associated implementation issue URL. Engineering Jira metadata is unavailable: the verified TWG Task-create call returned 403 (no project create permission). Under the delegated procedural checkpoint, use GitHub issue #25 as the engineering acceptance record, document this exception and open through gh if the repository helper requires a nonexistent Jira key. Do not invent/reuse an unrelated SC key or retry the denied Jira write. This does not change the independent incident-Jira acceptance path.
- Require exact-head CodeRabbit PR/security/CI, zero unresolved review threads and conclusive native QA Verify on the final head. Root may merge after those gates under delegated authority. Live GCP apply/publication/health is separate observed evidence, not implied by sandbox QA.

## Documentation and pilot handoff

Document the source/plan/release phase ordering, exact commands, state custody, actor/secret boundaries, actual access gaps, deployment/rollback/stop procedures and dated cost inputs. During execution the orchestrator maintains a process ledger. Final setup and Do/Say/See material will include high-resolution screenshots of actual observed results; videos are not required. Do not label the Mahesh-only pilot team-ready or omit unresolved live requirements.

## Primary references

- https://docs.cloud.google.com/build/docs/building/build-containers
- https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts
- https://developer.hashicorp.com/terraform/language/backend/gcs
- https://docs.cloud.google.com/iap/docs/using-tcp-forwarding
- https://docs.cloud.google.com/secret-manager/docs/access-control
