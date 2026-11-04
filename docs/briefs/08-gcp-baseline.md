# Brief 08 — `feat: private GCP baseline and deployment harness`

**Mode:** Brownfield operational infrastructure. **Jira:** SC-36
**GitHub:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/13
**Parent:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
**Status:** Draft for maintainer approval. Mahesh authorized starting Phase 2 planning and tracking. This brief's implementation scope and dependency exceptions, plus CodeRabbit's author plan, still require concrete approval before code changes.

Read AGENTS.md, docs/PLAN.md, the linked issues and this brief. CodeRabbit Code authors implementation and fixes; the Mac orchestrates and validates. Preserve every app behavior, test/assertion and golden, the six cart rules and brand. Keep each PR under 30 changed files.

## Goal and boundaries

Prepare reviewed infrastructure/container/harness code for one private Google Cloud healthy baseline. This coding task does not apply Terraform, create resources or IAM grants, populate secrets, push images, deploy, dispatch alerts, change live automations, seed faults, create incident Bugs or merge. Those are separate explicit operator actions after review of the actual plan, artifacts, costs and prerequisites.

Use project se-demos-project, proposed region us-central1 / zone us-central1-a, one e2-standard-2 Ubuntu 24.04 amd64 VM with a 30 GiB pd-balanced boot disk, a dedicated private VPC/subnet and Cloud NAT. The app remains Next.js 16 / React 19 / TypeScript 7, Node >=22.6.0, npm and localStorage only.

Phase 2 implements an explicit one-shot deployed browser verification journey. Continuous 30-second checks, service-check emission, failure/recovery/no-data thresholds, monitors, dashboard and incident automation belong to Phase 3. Keep the Phase 1 live handoff and QA access gaps visible.

## Assumptions (verified 2026-11-03 America/Los_Angeles)

- Start from merged main 092b03cc21e1c84b0aa6bbee20da014da29b53fa. All four main CI jobs pass. Existing worktree is clean; use branch codex/gcp-baseline.
- Main's Phase 1 tree has 338 passing Mac unit tests, 29 unchanged goldens and a successful 86-test Playwright/build run. Its exact-head review/security/strict gate passed. QA tested 74a4e11 and ended 1 Error / 4 Inconclusive: controlled fixtures passed, live service/real GitHub mutation proof unavailable. This is not passed Verify.
- Current Mac preflight reports 19 passes; only local US3 Datadog key validation is blocked by unavailable process credentials (exit 1). CLI and ADC refresh, intended project, CodeRabbit org/repo and Docker daemon/amd64 build path pass. ADC quota-project alignment is still unverified.
- us-central1 and us-central1-a are UP. Read-only regional quota: CPUs 2/5000, E2 CPUs 0/2400, instances 3/24000. No capacity reservation or effective organization-policy compliance is implied.
- Inventory finds one project bucket and two regional registries, without a clearly designated Terraform state bucket or owned DeskDrop registry. Preserve unrelated resources. Proposed state bucket se-demos-project-deskdrop-tfstate needs ownership/name validation before bootstrap.
- The project permission probe reports service enablement, Compute network/firewall/router/VM creation, registry creation, service-account creation/use, storage bucket creation and secret-container creation. Project and service-account IAM policy changes were not reported. Direct Editor exists; never grant broader roles automatically, remove existing roles, or claim this proves all resource-level permissions. Required IAM administration is an explicit operator gate.
- Official Ubuntu image is READY, X86_64: projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261024.
- Terraform 1.15.3 is installed. Official Google provider 8.10.0 release exists; compatibility is to be tested, not assumed. No external Terraform module or Datadog provider is needed in this phase.
- Existing Playwright config builds/starts localhost itself. Leave it unchanged and implement a separate target-driven checker without local fallback.
- Official fixed Node/Playwright/Agent image tags resolve with linux/amd64 manifests; immutable pins are proposed below.
- The post-merge automation failed on its legacy Jira-first-line expectation for PR 12. Documented fallback finished SC-35; that live automation and its docs are outside this brief.
- Google Cloud state/bootstrap, IAP, registry auth, Docker Ubuntu install and Datadog secret-backend documentation are linked in issue 13. Review those primary sources. No stored credential files, browser secrets or clipboard retrieval.

## Deliverables

### Terraform roots and state

Create separate infra/bootstrap and infra/terraform roots. Use only hashicorp/google = 8.10.0 and Terraform = 1.15.3; commit provider locks for darwin_arm64 and linux_amd64. No external modules/providers. Tests must mock every Google provider; native tests must never provision resources.

Bootstrap manages a dedicated private, versioned, uniform-access state bucket with public-access prevention, restricted IAM, force_destroy=false and retention/protection against ordinary demo teardown. Keep its initial local state separate, outside Git and securely retained; document a concrete bootstrap/import/optional migration procedure. Do not promise an uninitialized remote backend can create itself. The disposable demo uses a partial GCS backend referencing that pre-existing bucket with a distinct prefix and locking; do not commit credential-bearing backend configuration.

Demo resources: owned project services (disable_on_destroy=false), VPC/subnet with Private Google Access, router/NAT limited to the demo subnet, restricted IAP-only TCP22 firewall, shielded VM without public IP, OS Login, dedicated runtime service account, scoped Artifact Registry repository/cleanup policy, Secret Manager intake-secret metadata/reference and narrow resource IAM. No secret versions, credentials, authenticated webhook data or customer data in state, metadata, outputs or startup script. No Terraform local-exec/remote-exec, image builds or deployment side effects. Preserve shared APIs and unrelated IAM/resources.

Validate explicit project/region/zone/environment/name/size inputs and immutable image digest requirements. Reject wrong project, malformed/unbounded values and secret-bearing configuration where applicable; do not silently inherit gcloud state. Define a plan review boundary for every proposed role, principal, resource, ingress rule and destructive action. Resource-level IAM grants and the operator's missing IAM policy permissions remain separate checks.

Outputs contain non-secret resource names/identities, registry URI, VM/zone and IAP instructions. Examples have no real values for credentials. Keep real plans/state/tfvars/.terraform/generated deployment material excluded from Git; do not ignore the committed examples or provider locks.

### Containers, VM bootstrap and credential boundaries

Build production app image from the unchanged package.json/package-lock.json with a multi-stage Dockerfile and explicit linux/amd64. Do not add standalone-mode application configuration changes merely for packaging. Use a non-root runtime, health checks, bounded resources/log rotation and restart policy. Record exact source commit, upstream/application digest, target architecture and deployed identity. The VM runs the same published digest; no VM rebuild or mutable tag deployment.

Compose app, Datadog Agent and an explicit one-shot checker profile. Bind app only to VM loopback; app and checker have no public ports, cloud credentials, Datadog keys or Docker socket. Isolate app/checker from metadata and external credential endpoints, with actual local/deployed network-boundary evidence where available. Agent is the trusted telemetry boundary: only it receives the intake secret and necessary documented host/proc/cgroup/socket mounts. A read-only socket mount is not an API authorization boundary; document this exposure and minimize features/privileges. No application SDK/APM or backend.

Install Docker using the official signed Ubuntu repository and exact proposed runtime package versions/checksums below, with repeatable host bootstrap. Never pipe downloaded content into a shell or run unverified installers. No host credential/key output, xtrace, broadly readable secret files or secrets embedded in process arguments. Fetch the intake secret on the host through its runtime identity into a root-owned restricted runtime file; the Agent reads it via the documented secret backend. Use US3. Application keys remain off the VM. Bootstrap and secret retrieval must fail closed on errors, wrong targets or insecure permissions.

Pin runtime versions and digest references in deploy/runtime-versions.json. The author plan must resolve any proposed change to these pins before implementation approval.

### Mac harness and deployed checker

Implement explicit help/read-only validation plus separately invoked build, publish, Terraform-plan/apply, deploy, IAP tunnel and smoke operations. Never execute writes from a default/help/status invocation; no automatic login/project changes/API enablement/IAM escalation. Human execution of the reviewed saved plan and immutable deploy is distinct from author-task validation. A real cloud plan is blocked until backend, secrets-free inputs, permissions and cost gates are ready; do not invent a successful plan.

Use argument-based subprocesses, bounded output/timeouts, fixed/validated targets, safe diagnostics and no credential stdout. Do not construct unsafe remote shell fragments from arbitrary inputs; demonstrate target/path/digest validation and plan/artifact identity checks. Suppress tokens/secret responses. Keep IAP forwarding and VM access explicit; do not leave untracked background processes. Do not grant public ingress if IAP or QA access fails.

The checker uses existing Playwright against its explicit app URL, with no local webServer or fallback. Use fresh browser context/storage and synthetic shopper data. Add the $68 lamp and $32 organizer, assert $100 subtotal, DESK15 $15 discount, express $12, final $97; check checkout, receipt and every ordered item in history. Return bounded sanitized observations with source/image identity, excluding localStorage contents, entered personal fields and credentials. No production arbitrary-target credential path. A checker failure exits nonzero; no test weakening or golden changes.

### Tests, CI and operator docs

Add node --test behavior tests for harness/checker including success, wrong targets, missing/invalid config, digestless artifacts, unavailable tools, command/network failures, secret redaction, no mutation on read-only paths and no hidden local checker fallback. Test observable effects using controlled adapters; a missing module/setup failure is not meaningful RED.

Add credential-free infra CI separate from the unchanged four existing jobs. Pin new workflow actions to verified commits. Run Terraform fmt/init -backend=false/validate and fully mocked tests for both roots; verify bootstrap retention, IAP ingress/no public IP, runtime IAM/secret restrictions, invalid inputs and outputs. No cloud credentials, real applies, remote state writes or image pushes in PR CI.

Run npm ci, typecheck, complete unit/golden/build/e2e, appropriate Docker/Compose/local amd64 build/checker smoke and scoped checks on the Mac. Reuse an unchanged expensive check only with an explicit reason; no unsupported cloud proof. Retain meaningful regression red/green where applicable; entirely new modules need observable assertions, not fabricated RED.

Write gcp-baseline and gcp-costs docs with precise bootstrap, role/permission matrix, secure secret population, backend initialization, saved-plan review, registry publication, IAP deployment/verification, recovery, teardown and retained-state inventory. Price the actual proposed resources from dated primary sources: VM, disk, NAT IP/gateway/data, registry, state/storage/logging, Datadog and CodeRabbit. Record variable charges, owner/rehearsal/teardown window and a spend limit approved before apply; do not claim a cap is enforced by Terraform or a budget notification.

## Proposed file scope (25 files; not approved until maintainer accepts this brief)

```text
ALLOW: docs/briefs/08-gcp-baseline.md
ALLOW: .gitignore
ALLOW: .dockerignore
ALLOW: Dockerfile
ALLOW: deploy/compose.yaml
ALLOW: deploy/checker.Dockerfile
ALLOW: deploy/checker.mjs
ALLOW: deploy/bootstrap.sh
ALLOW: deploy/runtime-versions.json
ALLOW: scripts/demo/baseline.mjs
ALLOW: tests/demo-baseline.test.mjs
ALLOW: tests/deployed-checker.test.mjs
ALLOW: infra/bootstrap/main.tf
ALLOW: infra/bootstrap/.terraform.lock.hcl
ALLOW: infra/bootstrap/tests/state.tftest.hcl
ALLOW: infra/terraform/main.tf
ALLOW: infra/terraform/variables.tf
ALLOW: infra/terraform/outputs.tf
ALLOW: infra/terraform/.terraform.lock.hcl
ALLOW: infra/terraform/tests/baseline.tftest.hcl
ALLOW: infra/terraform/backend.hcl.example
ALLOW: infra/terraform/terraform.tfvars.example
ALLOW: docs/demo/gcp-baseline.md
ALLOW: docs/demo/gcp-costs.md
ALLOW: .github/workflows/infra.yml
```

No package.json, package-lock.json, smoke guard, application, existing CI, goldens, docs/PLAN.md or live automation changes. Ask for a brief amendment if a concrete plan needs another file/dependency; do not silently broaden scope.

## Proposed dependency/runtime authorization (separate from path globs)

These lines are proposals for maintainer approval, not existing authorization:

> ALLOW: dependency hashicorp/google@8.10.0 (both roots, locked darwin_arm64/linux_amd64)
> ALLOW: runtime Terraform@1.15.3
> ALLOW: image node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607 (linux/amd64)
> ALLOW: image mcr.microsoft.com/playwright:v1.64.1-noble@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0 (linux/amd64)
> ALLOW: image registry.datadoghq.com/agent:7.85.0@sha256:1e45b8442dbcc297a01eb9ef61b7b909650b30e50f3dd6aa3654d89380bf5cc9 (linux/amd64)
> ALLOW: VM image projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261024
> ALLOW: CI hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e (v4.0.1)
> ALLOW: CI actions/checkout@11d5960a326750d5838078e36cf38b85af677262 (verified v4)
> ALLOW: CI actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 (verified v4)
> ALLOW: host docker-ce@5:29.9.3-1~ubuntu.24.04~noble and docker-ce-cli@5:29.9.3-1~ubuntu.24.04~noble
> ALLOW: host containerd.io@2.4.2-3~ubuntu.24.04~noble
> ALLOW: host docker-buildx-plugin@0.38.1-1~ubuntu.24.04~noble
> ALLOW: host docker-compose-plugin@5.7.0-1~ubuntu.24.04~noble
> ALLOW: necessary signed Ubuntu OS dependencies for these pinned host packages only; no additional application npm dependency

Official Docker package-index SHA256 values: docker-ce c546181f0bc5f1d19085d764a3219aa86069468dbee4743fae420ee8a31809a4; docker-ce-cli 24f78a893cece8d345c4e90b5163907c047b996b747265f873743e8b0b0546d4; containerd.io f811ab57d1f4bb0cce19df7d526da8c711d8ebea0447cc83da1999188e664122; buildx 642e9a8a0d115a8a57ad7045a4c7c2561522331197f0c087a762de1b72591672; compose 61dd23ec4d0f6e4a99ef841f2ea2c0dc9cbada2c6ad99ffbd4f980ae957cc691. Verify signed-repository trust and checksums; these are not permission to execute a remote script.

## Author plan, review and delivery

Start a normal CodeRabbit Code task with a plan-only first turn; do not use --plan. Inspect the actual repo and draft a file-by-file implementation/test plan, identify capability gaps, challenge assumptions, and make no repository edits/installations/provider initialization until maintainer approval. Autofix remains off. Do not use extra model judges for this proposed CodeRabbit workflow unless Mahesh requests them.

After approval, one completed CodeRabbit CLI review is required for this NEW coding task before task completion or PR publication. A completed in-task run counts; Mac is fallback only, without duplicate review. Record task ID, reviewed base/head, completed outcome and every finding disposition. Existing-PR fix tasks/rounds are exempt. No CLI review needed for this plan-only turn.

CodeRabbit Code fixes validated findings within ALLOW. Verify round and whole-branch scope; preserve existing tests/assertions/goldens. PR description starts exactly Fixes https://github.com/coderabbit-demo/mmani-shopping-cart/issues/13 then Jira: SC-36. Open only after applicable prepublication checks pass. Require exact-head CodeRabbit PR approval/security, all checks and strict gate; request QA Agent Verify and retain its actual tested revision/results. Tooling fixtures do not prove deployed behavior or live IAM. No stale/inconclusive/error result counts as passed Verify.

Report changes and limitations, dependency/source pins, all validation evidence, CLI/PR dispositions, QA run/head/verdict, estimated costs, outstanding permissions/credential/runtime gates and the exact next human actions. No merge/apply/publish/deploy implied by a ready patch.

