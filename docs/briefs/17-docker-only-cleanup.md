<!-- coderabbit-ai-generated:v1 -->

# `refactor: retire cloud deployment and retain Docker`

**Status:** User-delegated plan approved on 2026-11-06; metadata-fixture amendment approved in the same task.
**Parent:** https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10
**Base:** main `0f0c42fcff214a8b8fbfd5ee5813d79d351dd94c`.
**Branch:** `coderabbit/retire-cloud-deployment/01781302` (managed prefix exception approved).

## Outcome

Delivery A removes the merged GCP runtime and keeps the functioning local Docker approach. PR32 was closed unmerged by Root. Delivery B separately consolidates superseded demo documents into setup and Do/Say/See guidance, including exact alert triggers. This delivery does not change the shopper application, dependencies, manifests, lockfiles or goldens. It performs no live provider, Mac runtime, monitor, credential, image, automation or fixture PR operations. No merge is authorized.

## Preservation and tests

- Extract the seccomp emitter from the retired bootstrap with identical emitted SHA-256 `6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c`. Preserve upstream policy bytes, default deny, clone3 errno and namespace restrictions.
- Keep architecture, Node image, Playwright image and Datadog image pins unchanged. Remove only cloud pins.
- Retain local journey/amount/receipt/history assertions, Chromium sandbox, browser/context cleanup, injected/default browser loading and bounded observations. Retire only cloud wrappers and validation.
- Migrate baseline sandbox, loopback/internal network, no secret/ports, real 2 MiB forwarder non-truncation, timeout/error socket cleanup and reserved alias assertions to local Compose. Retarget reusable bounded command checks to the local controller. Remove exclusively retired VM, registry, firewall, publication and release-controller cases.
- Remove cloud and CLI authentication/organization preflight prerequisites; retain repository, Docker and Datadog validation with offline fixtures. Tests must never execute real provider operations.
- Amendment: preserve every original local brief metadata assertion/value while changing its read URL to `tests/fixtures/local-monitoring-brief.md`. Fixture retains the original title, Jira SC-37 and issue 15 URL without historical instructions.
- Run unit, typecheck, golden check, production build and e2e gates. Native exact-head CodeRabbit PR/security feedback, CI and QA remain delivery gates. No CLI review/login/receipt prerequisite, extra judges or Autofix.

## Scope

Strictly fewer than 30 changed paths, conservatively counting rename source/destination. Only these 29 paths are authorized:

ALLOW: .github/workflows/infra.yml
ALLOW: .gitignore
ALLOW: .dockerignore
ALLOW: infra/bootstrap/.terraform.lock.hcl
ALLOW: infra/bootstrap/main.tf
ALLOW: infra/bootstrap/tests/state.tftest.hcl
ALLOW: infra/terraform/.terraform.lock.hcl
ALLOW: infra/terraform/backend.hcl.example
ALLOW: infra/terraform/main.tf
ALLOW: infra/terraform/outputs.tf
ALLOW: infra/terraform/terraform.tfvars.example
ALLOW: infra/terraform/tests/baseline.tftest.hcl
ALLOW: infra/terraform/variables.tf
ALLOW: deploy/bootstrap.sh
ALLOW: deploy/seccomp-profile.sh
ALLOW: deploy/checker.Dockerfile
ALLOW: deploy/checker.mjs
ALLOW: deploy/compose.yaml
ALLOW: deploy/runtime-versions.json
ALLOW: scripts/demo/baseline.mjs
ALLOW: scripts/demo/local.mjs
ALLOW: scripts/demo/preflight.mjs
ALLOW: tests/demo-baseline.test.mjs
ALLOW: tests/demo-preflight.test.mjs
ALLOW: tests/deployed-checker.test.mjs
ALLOW: tests/docker-only.test.mjs
ALLOW: docs/briefs/17-docker-only-cleanup.md
ALLOW: tests/local-demo.test.mjs
ALLOW: tests/fixtures/local-monitoring-brief.md
