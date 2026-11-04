<!-- coderabbit-ai-generated:v1 -->

# Phase 2 private baseline operator runbook

This document prepares human-controlled operations. A passing mock test or local container test does not establish cloud authorization, private access, convergence, Datadog intake or QA Verify. Do not apply, publish or deploy until the maintainer has separately approved the actual plans, cost worksheet, permissions and deployment. Phase 2 has one explicit browser journey; monitors and continuous checks are Phase 3. Phase 1 native handoff and QA access gaps remain open.

## Before any operation

- Use this reviewed commit on the Mac with Node 22.6+, npm, Terraform 1.15.3, gcloud, Docker with Buildx 0.13+ and an amd64 builder. Pin checks in `deploy/runtime-versions.json` are mandatory; never substitute a version silently. The bootstrap requires Ubuntu 24.04 amd64, Python 3, curl, GPG, apt, iptables, ip6tables and systemd. It checks the Docker repository key fingerprint, downloads packages from its signed repository and verifies the five approved package hashes. It does not run an unverified installer.
- Confirm project `se-demos-project`, `us-central1`, `us-central1-a`, quota, organization policy, ADC quota project, registry/bucket ownership and the state operator principal. No login or gcloud project change is performed by the harness. The planned subnet is `10.90.0.0/24`; the dedicated Docker bridge uses `172.30.243.0/24`. Resolve any network overlap before apply.
- Record state custody: encrypted storage outside the checkout, owner, access and tested recovery copy for bootstrap local state. Confirm the proposed bucket name is available and owned by the intended project. Complete and obtain approval for [the cost worksheet](gcp-costs.md), owner, spend limit, rehearsal and teardown window. A budget alert is not a spending cap.
- Review every resource, principal, role, firewall rule, destructive action and saved plan. Plans, state, local tfvars, approval files, Docker credentials and runtime secret material are sensitive operational data: keep them out of Git and secure the storage and backups. No secret value belongs in tfvars, Terraform state, metadata, startup scripts or command arguments.

## Permission review

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

All harness operations are explicit: `node scripts/demo/baseline.mjs help`. It uses fixed targets, bounds child output/time and suppresses diagnostics. The local artifacts directory is `artifacts/gcp-baseline/`, ignored by Git. Keep it private and retain reviewed receipts. The harness refuses a dirty source tree and never performs auto-login.

1. After the appropriate local build approval, run `node scripts/demo/baseline.mjs build`. It archives the committed source, builds both images for linux/amd64, records image IDs, and validates OCI manifest/config digests and source labels. It writes the manifest digest before any registry exists. This permits infrastructure creation before publication.
2. Create private `artifacts/gcp-baseline/bootstrap.tfvars.json` with exactly `project_id`, `bucket_name`, `state_operator`; create `bootstrap-state.json` with exactly `statePath`, an absolute path in the approved encrypted location outside the checkout. The directory must already exist. Initialise bootstrap explicitly with `terraform -chdir=infra/bootstrap init -backend=false`. Run `node scripts/demo/baseline.mjs plan bootstrap`. Review the actual saved plan, its hash and protected local state.
3. Only after human approval, create `bootstrap-approval.json` with the exact returned `planHash`, nonempty `owner` and `teardown`, and boolean `permissionsChecked`, `stateCustodyConfirmed`, `costApproved` all true. Then the human runs `node scripts/demo/baseline.mjs apply bootstrap`. The bucket has uniform access, public-access prevention, versioning, `force_destroy=false` and Terraform `prevent_destroy`. These do not prevent privileged deletion or deletion after configuration removal. Never set a retention rule that prevents GCS lock object deletion. Keep the bootstrap state and recovery copy outside Git.
4. Once the bucket exists, initialise the demo backend explicitly: `terraform -chdir=infra/terraform init -backend-config=backend.hcl.example`. The partial backend uses bucket `se-demos-project-deskdrop-tfstate`, prefix `deskdrop/demo` and GCS locking. Do not supply backend credentials or encryption keys in backend configuration. Verify ADC and the bucket permissions separately.
5. Create private `terraform.tfvars.json` with exactly `project_id`, `region`, `zone`, `environment`, `image_digest`; use the app OCI manifest digest recorded in `build.json` with the owned registry path. Run `node scripts/demo/baseline.mjs plan terraform`, inspect the saved plan and its identity, then create `terraform-approval.json` with the same fields and exact plan hash as above. A human may run `node scripts/demo/baseline.mjs apply terraform` only after the separate approval. No image has been published or VM deployed by these steps.

Saved plans are bound to the commit, input, lockfile and backend configuration. If any input changes, discard the old plan and approval and create and review a new one. The harness uses write-once receipts; archive or remove old artifacts only after checking their custody and impact. A timeout has an unknown remote outcome: inspect actual state before any retry.

## Publication and private deployment

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:0d6b6ac068830d3431bcf97271ff0226897a22b95a6d81c3a60a47e1bd63e1f1 -->

The registry must exist before publication. The harness records `bootstrap-applied.json` and `terraform-applied.json` only after successful human apply commands. Before publication, write `publication-approval.json` containing the reviewed `commit`, `appDigest`, `checkerDigest`, nonempty `owner` and `approved: true`; the digests must match `build.json`. Before host installation or deployment, write `deploy-approval.json` with the reviewed `commit`, `appDigest`, `checkerDigest`, the `planHash` from `terraform-applied.json`, nonempty `owner`, and `secretProvisioned`, `vmReady`, `iapAuthorized`, `costApproved` all true. These operator attestations are gates, not live verification. Authenticate the Mac to the owned Artifact Registry through the operator's approved method.

<!-- /coderabbit-ai-generated:v1 --> `node scripts/demo/baseline.mjs publish` is a separate human action. It verifies the build's local image IDs and requires each pushed digest to equal its reviewed OCI manifest digest. A mismatch or partial push fails: inspect the registry and rebuild/replan if needed; do not substitute a tag.

A separately authorized operator adds the Datadog US3 intake key as a Secret Manager version through a secure stdin-based workflow, without displaying or placing the value in arguments, tfvars, state, logs or shell history. No Datadog application key belongs on the VM. `node scripts/demo/baseline.mjs host-install` separately transfers hash-checked host files via IAP and performs the pinned host setup on the named VM. `node scripts/demo/baseline.mjs deploy` separately validates the same files and starts the app and Agent using the reviewed digests. The VM pulls images and never rebuilds.

The Agent is trusted host infrastructure: Docker socket access is effectively host control even when mounted read-only. It alone receives the root-only runtime intake file through the documented Datadog file secret backend. The app and checker have an internal bridge, no cloud credentials, no socket, and no external ports. The app is published only on VM loopback. Firewall rules deny bridge access to host services and off-bridge destinations, including metadata; IPv6 bridge traffic is denied. The firewall service precedes Docker and refreshes the restricted secret before boot-time container restart. Verify rules and isolation after installation, host restart and Docker restart; include IPv4, IPv6, metadata hostname and host endpoint attempts. The Mac fixture/local-container evidence is separate from actual Ubuntu VM evidence. Fail deployment acceptance if any path succeeds or the Chromium sandbox cannot start.

Use `node scripts/demo/baseline.mjs tunnel` for a foreground, ten-minute IAP SSH forwarding session on `127.0.0.1:3100`; stop it explicitly. `node scripts/demo/baseline.mjs smoke` invokes one fresh Playwright journey on the private app: $100 subtotal, DESK15 $15 discount, $12 express delivery, $97 total, receipt and all order items. The result reports only the source and image identifiers and a bounded status. Independently inspect the running container digest and source label, US3 Agent intake and five minutes of healthy behavior. Perform a second real reviewed plan; do not call fixtures or a stale/inconclusive/error QA result a pass.

## Recovery and teardown

For missing bootstrap state, retrieve the approved encrypted recovery copy and verify its lineage and serial before any operation. If recovery is impossible, a qualified operator must import the existing bucket into a new separately secured bootstrap state and review a plan; never create a replacement bucket blindly. Recover demo state from an approved GCS object version only after stopping writers and preserving current versions. Do not force-unlock until the lock owner and operation are confirmed absent.

A human creates and reviews a separate destroy plan for the demo root, confirms the exact state and scope, then applies that saved plan under the approved teardown window. Do not destroy the bootstrap root as ordinary demo teardown. Review remaining state versions, bootstrap bucket, shared APIs, any registry/image residue, external IP/NAT, secret versions, logs, local plans and receipts; document retained owners, access and ongoing costs. Do not remove shared APIs, unrelated resources or unrelated IAM bindings.
