<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f788b6d55ef2f04fcbe5075d38b29a9753ade443c3ae3107f4ec2ca4be220f6f -->

# Phase 2 private baseline operator runbook

This document prepares human-controlled operations. A passing mock test or local container test does not establish cloud authorization, private access, convergence, Datadog intake or QA Verify. Do not apply, publish or deploy until the maintainer has separately approved the actual plans, cost worksheet, permissions and deployment. Phase 2 has one explicit browser journey; monitors and continuous checks are Phase 3. Phase 1 native handoff and QA access gaps remain open.

## Before any operation

- Use this reviewed commit on the Mac with Node 22.6+, npm, Terraform 1.15.3, gcloud, Docker with Buildx 0.13+ and an amd64 builder. Pin checks in `deploy/runtime-versions.json` are mandatory; never substitute a version silently. The bootstrap requires Ubuntu 24.04 amd64, Python 3, curl, GPG, apt, iptables, ip6tables and systemd. It checks the Docker repository key fingerprint, downloads packages from its signed repository and verifies the five approved package hashes. It does not run an unverified installer.
- Confirm project `se-demos-project`, `us-central1`, `us-central1-a`, quota, organization policy, ADC quota project, registry/bucket ownership and the state operator principal. No login or gcloud project change is performed by the harness. The planned subnet is `10.90.0.0/24`; the dedicated Docker bridge uses `172.30.243.0/24` and the publishing bridge uses `172.30.244.0/24`. Resolve any network overlap before apply.
- Record state custody: encrypted storage outside the checkout, owner, access and tested recovery copy for bootstrap local state. Confirm the proposed bucket name is available and owned by the intended project. Complete and obtain approval for [the cost worksheet](gcp-costs.md), owner, spend limit, rehearsal and teardown window. A budget alert is not a spending cap.
- Review every resource, principal, role, firewall rule, destructive action and saved plan. Plans, state, local tfvars, approval files, Docker credentials and runtime secret material are sensitive operational data: keep them out of Git and secure the storage and backups. No secret value belongs in tfvars, Terraform state, metadata, startup scripts or command arguments.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:0e1fb614b4e882cf7fc33a36c090e361faaddfa08a081f4a397b82a0b98e4650 -->

### Mac image-store prerequisite

Before building or publishing, the Mac Docker daemon must use the containerd image store. Run the read-only check `docker info --format '{{json .DriverStatus}}'` and confirm a `driver-type` entry of `io.containerd.snapshotter.v1`. Stop before build if it is absent or the check fails. Build records OCI exporter manifest digests and loads images into the daemon; publication pushes those images from the daemon and must still fail if a pushed digest differs from its reviewed digest. The maintainer independently reported Mac `DriverStatus` as `[["driver-type","io.containerd.snapshotter.v1"]]`; that observation is not proof of publication or digest equality.

[Docker Engine guidance](https://docs.docker.com/engine/storage/containerd/) says fresh Engine 29+ installations default to the containerd image store, while upgrades retain legacy drivers until enabled. Switching stores hides existing images and containers until switching back; review [Docker Desktop guidance](https://docs.docker.com/desktop/features/containerd/) before any separately authorized change to the daemon.

## Permission review

<!-- /coderabbit-ai-generated:v1 -->

The previous project probe did not establish these permissions. Verify each with the actual operator and organization policies; do not automatically grant roles.

| Operation | Required scope and permission to verify |
| --- | --- |
| Enable APIs | Project `serviceusage.services.enable`; the configuration keeps shared services enabled on destroy. |
| Create and manage network, router, NAT, firewall, VM, disks | Relevant `compute.*` create, read, update and delete permissions on the dedicated project resources. |
| Attach runtime identity to VM | `iam.serviceAccounts.actAs` on the dedicated runtime account; service account create/read/delete permissions for its lifecycle. |
| Create bootstrap bucket and object IAM member | Bucket create/read plus `storage.buckets.getIamPolicy` and `storage.buckets.setIamPolicy`; object read/list/create/delete for state and GCS lock objects. The scoped `storage.objectAdmin` grant covers objects; verify separate bucket read and backend prerequisites. |
| Create registry and its reader binding | Artifact Registry repository create/read/delete and repository `getIamPolicy`/`setIamPolicy`; publisher separately needs repository upload permissions. |
| Create secret metadata and its accessor binding | Secret create/read/delete and secret `getIamPolicy`/`setIamPolicy`; a separate authorized operator adds the secret version. Runtime gets `roles/secretmanager.secretAccessor` only on that secret. |
| VM registry pull | Runtime gets `roles/artifactregistry.reader` only on the owned repository. The VM has cloud-platform OAuth scope; the two resource bindings constrain its account. |
| IAP SSH and OS Login | IAP tunnel access and OS Login/OS Admin Login permissions for the selected human, plus the necessary service-account use permissions. Do not add public ingress as a workaround. |

Project or service-account policy changes require their own `getIamPolicy`/`setIamPolicy` permissions if the final reviewed design includes them. IAM member resources add the specified members; review pre-existing policies and never remove unrelated principals.

## Build, bootstrap and state

All harness operations are explicit: `node scripts/demo/baseline.mjs help`. It uses fixed targets, bounds child output/time and suppresses diagnostics. SIGINT/SIGTERM are forwarded only to the owned child process group, with a one-second grace before forced cleanup and listener removal. An interrupted remote operation can already have changed remote state: inspect before retrying. The local artifacts directory is `artifacts/gcp-baseline/`, ignored by Git. Keep it private and retain reviewed receipts. The harness refuses a dirty source tree and never performs auto-login.

1. After the appropriate local build approval, run `node scripts/demo/baseline.mjs build`. It archives the committed source, builds both images for linux/amd64, records image IDs, and validates OCI manifest/config digests and source labels. It writes the manifest digest before any registry exists. This permits infrastructure creation before publication.
2. Create private `artifacts/gcp-baseline/bootstrap.tfvars.json` with exactly `project_id`, `bucket_name`, `state_operator`; create `bootstrap-state.json` with exactly `statePath`, an absolute path in the approved encrypted location outside the checkout. The directory must already exist. Initialise bootstrap explicitly with `terraform -chdir=infra/bootstrap init -backend=false`. Run `node scripts/demo/baseline.mjs plan bootstrap`. Review the actual saved plan, its hash and protected local state.
3. Only after human approval, create `bootstrap-approval.json` with the exact returned `planHash`, nonempty `owner` and `teardown`, and boolean `permissionsChecked`, `stateCustodyConfirmed`, `costApproved` all true. Then the human runs `node scripts/demo/baseline.mjs apply bootstrap`. The bucket has uniform access, public-access prevention, versioning, `force_destroy=false` and Terraform `prevent_destroy`. These do not prevent privileged deletion or deletion after configuration removal. Never set a retention rule that prevents GCS lock object deletion. Keep the bootstrap state and recovery copy outside Git.
4. Once the bucket exists, initialise the demo backend explicitly: `terraform -chdir=infra/terraform init -backend-config=backend.hcl.example`. The partial backend uses bucket `se-demos-project-deskdrop-tfstate`, prefix `deskdrop/demo` and GCS locking. Do not supply backend credentials or encryption keys in backend configuration. Verify ADC and the bucket permissions separately.
5. Create private `terraform.tfvars.json` with exactly `project_id`, `region`, `zone`, `environment`, `image_digest`; use the app OCI manifest digest recorded in `build.json` with the owned registry path. Run `node scripts/demo/baseline.mjs plan terraform`, inspect the saved plan and its identity, then create `terraform-approval.json` with the same fields and exact plan hash as above. A human may run `node scripts/demo/baseline.mjs apply terraform` only after the separate approval. No image has been published or VM deployed by these steps.

Saved plans are bound to the commit, input, lockfile and backend configuration. If any input changes, discard the old plan and approval and create and review a new one. The harness uses write-once receipts; archive or remove old artifacts only after checking their custody and impact. A timeout has an unknown remote outcome: inspect actual state before any retry.

## Publication and private deployment

The registry must exist before publication. The harness records `bootstrap-applied.json` and `terraform-applied.json` only after successful human apply commands. Before publication, write `publication-approval.json` containing the reviewed `commit`, `appDigest`, `checkerDigest`, nonempty `owner` and `approved: true`; the digests must match `build.json`. Before host installation or deployment, write `deploy-approval.json` with the reviewed `commit`, `appDigest`, `checkerDigest`, the `planHash` from `terraform-applied.json`, nonempty `owner`, and `secretProvisioned`, `vmReady`, `iapAuthorized`, `costApproved` all true. These operator attestations are gates, not live verification. Authenticate the Mac to the owned Artifact Registry through the operator's approved method.

`node scripts/demo/baseline.mjs publish` is a separate human action. It verifies the build's local image IDs and requires each pushed digest to equal its reviewed OCI manifest digest. A mismatch or partial push fails: inspect the registry and rebuild/replan if needed; do not substitute a tag.

A separately authorized operator adds the Datadog US3 intake key as a Secret Manager version through a secure stdin-based workflow, without displaying or placing the value in arguments, tfvars, state, logs or shell history. No Datadog application key belongs on the VM. `node scripts/demo/baseline.mjs host-install` separately transfers hash-checked host files via IAP and performs the pinned host setup on the named VM. `node scripts/demo/baseline.mjs deploy` separately validates the same files and starts the app and Agent using the reviewed digests. The VM pulls images and never rebuilds.

The Agent is trusted host infrastructure: Docker socket access is effectively host control even when mounted read-only. It alone receives `/run/deskdrop/secrets/` as a read-only directory bind, with `create_host_path: false`; the host creates and validates both runtime directories as root-owned mode 0700 before Docker starts. Only `intake` (mode 0600) resides in that directory. Temporary registry authentication remains outside this mount and is removed after pulls. Atomic secret-file replacement preserves the prior restricted file when retrieval fails; the directory bind sees replacements without recreating a single-file bind. Never repair a directory at the key path by writing a credential into it: stop the Agent, investigate/remove only that invalid runtime directory, then explicitly recover.

App and checker use only an internal bridge: no credentials, Docker socket or published ports. A fixed-target TCP forwarder reuses the exact app image and non-root Node runtime; it publishes only VM `127.0.0.1:3000` and connects only to `app:3000`. It has no mounts, capabilities or writable root filesystem; connections are capped at 128 and idle sockets expire after 30 seconds. A second non-internal bridge makes loopback publication work even when Docker suppresses ports on internal-only networks. This bridge itself does not prevent egress: mandatory host firewall rules protect **both** bridges. They drop new bridge-to-host traffic and new off-subnet traffic (including metadata), while accepting only established replies to host connections and returning established forwarded replies to Docker's remaining rules. IPv6 bridge traffic is denied and disabled in app, checker and forwarder. The proxy does not grant arbitrary target selection.

The mandatory firewall systemd unit precedes and is required by Docker. It installs and verifies isolation, verifies fixed VM identity, and prepares secure empty runtime directories without contacting Secret Manager. Isolation/identity/runtime permission failures block Docker. Initial `start` remains strict: metadata/secret authentication, both immutable amd64 image identities, policy hash and Agent startup must succeed. Boot `restart` verifies cached image architecture/source and starts app/forwarder with `--pull never` and waits for their health checks; it needs no registry login or image download. It then attempts a bounded secret refresh and starts/recreates the Agent. If telemetry retrieval/startup fails, it stops the Agent and reports `Telemetry degraded; Agent stopped; app remains running`. This is app availability with degraded telemetry, never a passing telemetry/deployment acceptance. Once the provider recovers, a separately authorized operator can rerun `/opt/deskdrop/bootstrap.sh restart` on that VM; it rechecks isolation/identity/images and retries telemetry. Compose operations are bounded to 90 seconds with five-second kill escalation; boot unit start limits are explicit. No scheduler or continuous check is installed. Verify real reboot, Docker restart and recovered US3 intake before live acceptance.

The browser endpoint is fixed to `http://deskdrop.test:3000`, explicitly assigned as an app alias on the isolated network. It is a reserved private name; there is no arbitrary-target or localhost fallback. Bare `app` is rejected because [Google Registry documents .app as HSTS-preloaded and HTTPS-required](https://www.registry.google/domains/app/). The maintainer's same-container Mac probe returned `ERR_SSL_PROTOCOL_ERROR` through `http://app:3000/` and HTTP 200 through `http://deskdrop.test:3000/`, with fresh sandboxed contexts. The forwarder's TCP backend remains the fixed service DNS `app:3000`; it does not navigate a browser. No HSTS/TLS protection is bypassed.

### Chromium policy and local smoke

`bootstrap.sh seccomp-profile` is the only unprivileged bootstrap mode: it emits reviewed public JSON to stdout and performs no host setup, credential retrieval or firewall operation. The embedded base is [Moby's Docker default policy at 4b8214f](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/seccomp/default.json), original SHA-256 `6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`. All baseline rules, architecture restrictions, default errno and capability/kernel conditions are retained. The sole extra allow rule permits `clone`, `setns`, `unshare`, `chroot` for Chromium's user namespace sandbox. The namespace operations follow [pinned Playwright guidance](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/utils/docker/seccomp_profile.json); Mac runtime evidence additionally established the need for `chroot` after entering the user namespace. Host capabilities remain dropped: `chroot` still needs the kernel capability inside that namespace. No SYS_ADMIN, unconfined policy or disabled Chromium sandbox is used. The checker has private 512 MiB shared memory, a read-only root with a bounded writable `/tmp`, and runs as UID 1000 with no-new-privileges.

The final generated policy SHA-256 is `6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c`. Host installation generates `/opt/deskdrop/checker-seccomp.json` from the hash-checked staged bootstrap, checks its digest, and installs it root-owned mode 0600; start/restart/check verify its type/ownership/mode/digest again. The host-install/deploy receipt binds bootstrap and Compose hashes, hence the embedded policy, to the reviewed source. No profile is downloaded at runtime. `CHECKER_SECCOMP_PROFILE` only selects the local smoke fixture path; VM deployment uses the fixed installed path and digest.

After building the **current committed** images locally via the harness, run the following in an isolated local Docker project with port 3000, both dedicated subnets and both fixed bridge names free. It uses only already built images, does not start the Agent, fetch a secret, modify the Mac firewall, publish an image or contact cloud APIs. The checker-reported digest below is a locally recorded OCI identity, not evidence of a registry pull or deployment. Run in a subshell so temporary variables and cleanup remain scoped.

```bash
(
  set -euo pipefail
  task_fixture=$(mktemp -d)
  export COMPOSE_PROJECT_NAME=deskdrop-correction-smoke
  export SOURCE_COMMIT=$(node -p "require('./artifacts/gcp-baseline/build.json').commit")
  export APP_IMAGE="deskdrop-app:$SOURCE_COMMIT"
  export CHECKER_IMAGE="deskdrop-checker:$SOURCE_COMMIT"
  export CHECKER_SECCOMP_PROFILE="$task_fixture/checker-seccomp.json"
  task_app_digest=$(node -p "require('./artifacts/gcp-baseline/build.json').manifests.app")
  trap 'docker compose -f deploy/compose.yaml --profile check down --remove-orphans; rm -rf -- "$task_fixture"' EXIT
  bash deploy/bootstrap.sh seccomp-profile > "$CHECKER_SECCOMP_PROFILE"
  printf '%s  %s\n' 6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c "$CHECKER_SECCOMP_PROFILE" | shasum -a 256 -c -
  docker compose -f deploy/compose.yaml up -d --pull never --wait --wait-timeout 90 app forwarder
  curl --fail --max-time 10 http://127.0.0.1:3000/ >/dev/null
  docker compose -f deploy/compose.yaml --profile check run --rm --no-deps --pull never \
    -e "APP_IMAGE=us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@$task_app_digest" checker
)
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c04797b47434d10ec49411e1115a1a9da8459024a8fd970aa4ebfeac0063a34e -->

Confirm the current local image IDs equal `build.json` and source labels/amd64 architecture before this smoke. Inspect the resolved Compose config: only forwarder publishes loopback, checker reaches app privately, and app/checker have only the internal network and no credential/host mounts. Run bounded TCP-only probes (no credential endpoint responses) from app/checker toward a disposable host canary, metadata IP/hostname and external canary; each new connection must fail. Record listener/HTTP and sandbox execution separately from isolation results. Mac Docker does not install the VM firewall, so it cannot establish forwarder egress isolation; the stateful rule fixture is separate from live Linux packet evidence. A disposable Linux firewall fixture and the actual Ubuntu VM must additionally prove both bridges deny NEW host/metadata/external attempts while host loopback/IAP HTTP, established replies and private checker traffic succeed. Repeat after host/Docker restart, with IPv4/IPv6/hostname variants. Preserve sandbox diagnostics without collecting page or credential bodies; do not classify an actual configuration failure as emulation.

### Maintainer-supplied Mac verification

The maintainer reports that actual local amd64 harness-built app and checker images and resolved Compose settings passed at production commit `f46c068e468514a357d162ad362982144f69c78a`. The forwarder had a real `127.0.0.1` ephemeral host binding and returned HTTP 200. The checker ran with UID 1000, all capabilities dropped, no-new-privileges, a read-only root and `/tmp` tmpfs, 512 MiB private shared memory, 512 MiB memory, 0.5 CPU, and generated seccomp policy SHA-256 `6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c`; no SYS_ADMIN was granted. Its sandboxed `cart-receipt-history` journey passed, checking $100 subtotal, $15 discount, $12 delivery, $97 total, the receipt and both history items. The temporary project was cleaned up.

The measured app OCI digest was `sha256:3dc6f1d00525e728ca09cc5cdf9d349a5f1df82a3c6bb75810374dc20befc549`; checker OCI digest was `sha256:4836023c06b9dc37980b9a41f72617dc4e8d82ea248dea6bf5c040dfc6faa070`. The registry-shaped `APP_IMAGE` identity was a local fixture using the measured digest: no image was published to or pulled from that registry. These observations do not establish deployment, host firewall enforcement, metadata isolation, IAM, IAP, Secret Manager or US3 intake.

At the same production commit, Terraform fmt/validate and four bootstrap plus seven demo native mocked runs passed. The maintainer also reports that test-only commit `596697243f3995d31979377d9f8d44bbc9a6ab55` passed npm ci, all 375 units, typecheck, 29 unchanged goldens, production build and 86 Playwright tests on Mac Bash 3.2. The e2e run used an isolated free port via `PLAYWRIGHT_PORT`; an existing service on port 3100 was left untouched. Only `tests/demo-baseline.test.mjs` changed between the two commits; the production graph, Compose configuration, generated policy, Terraform and documentation were byte-identical, so the Mac container and mocked Terraform results remain applicable to that test-only revision. Mac GitHub GFM rendering showed all ten cost rows in one table body.

The maintainer reports a focused comparison using identical head test contents: eight loaded `ERR_ASSERTION` failures and zero setup failures against `580457927d4a3b165880f0936b8f92109a835f88`, followed by zero failures at `596697243f3995d31979377d9f8d44bbc9a6ab55`. The endpoint-specific regression independently produced assertion RED/GREEN with identical tests/imports and the same approved dependency tree. A full-file baseline run had setup errors for behavior absent from the baseline and is not counted as RED. The same-container Mac HSTS comparison also produced SSL failure through `app` and HTTP 200 through `deskdrop.test`.

Pending separate evidence includes actual Ubuntu firewall and host-canary probes, metadata isolation after Docker restart and VM reboot, scoped IAM, Secret Manager and IAP authorization, recovered US3 intake, exact-head PR review/security/CI, and a successful native QA Agent Verify. The cost worksheet and spend window remain unapproved. The Mac listener and browser results do not prove Linux host firewall behavior or cloud deployment.

<!-- /coderabbit-ai-generated:v1 -->

### Registry retention and labels

The registry deletes only untagged versions older than seven days and keeps at least the five most recent versions per package. KEEP wins over DELETE. Publication tags each image with its source commit; preserve tags on reviewed/current deployments and rollback versions, and review a deletion preview before any cleanup is enabled live. Untagged historic artifacts can be removed asynchronously, so retaining a digest alone without a tag is not a permanent retention guarantee. Terraform labels on the VM, boot disk, registry, secret and bootstrap state bucket are `service=deskdrop`, `environment=demo`, `managed_by=terraform`. These describe ownership by the service, not an approved billing owner or identity.

Use `node scripts/demo/baseline.mjs tunnel` for a foreground, ten-minute IAP SSH forwarding session on `127.0.0.1:3100`; stop it explicitly. `node scripts/demo/baseline.mjs smoke` invokes one fresh Playwright journey on the private app: $100 subtotal, DESK15 $15 discount, $12 express delivery, $97 total, receipt and all order items. The result reports only the source and image identifiers and a bounded status. Independently inspect the running container digest and source label, US3 Agent intake and five minutes of healthy behavior. Perform a second real reviewed plan; do not call fixtures or a stale/inconclusive/error QA result a pass.

## Recovery and teardown

For missing bootstrap state, retrieve the approved encrypted recovery copy and verify its lineage and serial before any operation. If recovery is impossible, a qualified operator must import the existing bucket into a new separately secured bootstrap state and review a plan; never create a replacement bucket blindly. Recover demo state from an approved GCS object version only after stopping writers and preserving current versions. Do not force-unlock until the lock owner and operation are confirmed absent.

A human creates and reviews a separate destroy plan for the demo root, confirms the exact state and scope, then applies that saved plan under the approved teardown window. Do not destroy the bootstrap root as ordinary demo teardown. Review remaining state versions, bootstrap bucket, shared APIs, any registry/image residue, external IP/NAT, secret versions, logs, local plans and receipts; document retained owners, access and ongoing costs. Do not remove shared APIs, unrelated resources or unrelated IAM bindings.

## In-task CLI review receipt and correction dispositions

Task `881100be-1192-43aa-a803-7b412f0041d1`: the maintainer supplied Mac receipt is `review_completed`, outcome `completed`, reviewed base `092b03cc21e1c84b0aa6bbee20da014da29b53fa`, head `580457927d4a3b165880f0936b8f92109a835f88`, all 25 paths. It is the single completed CLI review for this original coding task; the earlier disabled cloud attempt did not count. This correction round does not run another CLI review and the receipt does not claim review of subsequent changes.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:426e5277d44a30947b8ee441ff693d0fbf136d5fcb8f674bb48d58229470b89f -->

| Finding | Disposition in this correction round |
| --- | --- |
| Major: detached children survive interruption | Fixed: forward SIGINT/SIGTERM to the owned group, bounded escalation, remove listeners on every settlement; real subprocess regressions and the maintainer's focused assertion comparison. |
| Major: Chromium namespace sandbox denied | Fixed: pinned default-deny Docker policy plus four sandbox calls, hash-bound installation and 512 MiB private shared memory. The final policy and sandboxed checker passed on the Mac at `f46c068`; live Ubuntu proof remains pending. |
| Major: internal-only published port has no listener | Fixed: fixed-target non-root Node forwarder, loopback publication on second bridge and established-reply firewall rules. Real Mac Docker loopback binding and HTTP 200 passed at `f46c068`; Linux host firewall and isolation proof remain pending. |
| Minor: KEEP-only registry cleanup | Fixed: seven-day untagged DELETE plus five recent KEEP; the four bootstrap and seven demo mocked Terraform runs passed on the Mac at `f46c068`. |
| Minor: generated markers split cost table | Fixed: one contiguous table; required provenance stays outside rendered content/table. Mac GitHub GFM rendering confirmed all ten rows in one table body. |
| Minor: boot secret failure blocks Docker | Fixed: mandatory isolation/identity/runtime preparation separated from bounded telemetry recovery; secure directory bind and atomic file replacement. Boot/outage/recovery fixtures passed; live VM reboot and telemetry proof remain pending. |

Additional runtime finding: the browser URL/Compose alias uses reserved `deskdrop.test`, and the old HSTS `app` endpoint is rejected. The full sandboxed Mac journey passed at `f46c068` with the local fixture identity described above; no deployment or QA Verify is implied.

<!-- /coderabbit-ai-generated:v1 -->

Additional maintainer finding: non-secret service/environment/managed-by labels added to all label-capable owned resources, with native assertions. No finding was skipped. Exact-head PR review/security/CI and successful QA Agent Verify remain separate later gates; this receipt and fixtures do not satisfy them.


<!-- /coderabbit-ai-generated:v1 -->