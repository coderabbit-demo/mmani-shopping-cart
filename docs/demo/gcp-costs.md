<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4a98224ed7fb895c9cb6504d93ddfead83826cea9fc71e4411e76c156b660310 -->

<!-- coderabbit-ai-generated-section:v1:8b8c8b445ed862daa1a10e4f187bcbf6832d598e39e0b9e079260852161bc5df -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:257c3b3f8dddd0407c9e7f99efc1646f3e2107e399ae106bcd8cc3cf0f7f4513 -->

# GCP seven-day pilot cost worksheet

**Owner:** Mahesh. **Scope:** the Mahesh-only pilot in `se-demos-project`, using one `e2-standard-2` VM in `us-central1-a`. Mahesh approved up to **$100 of Google Cloud use for the first seven days** as an operational allowance. The seven-day tracking period starts with the first actual DeskDrop cloud consumption; it has not started in this work. Record the actual start time, usage, spend and seven-day deadline when observed. Do not infer them from this illustration or from code work.

**Status:** No cloud resources or consumption have been started by this coding work. Actual billing and live deployment readiness remain unverified. Existing project Editor does not establish the tested IAM policy-write or IAP access permissions; team access and a second presenter remain deferred. This worksheet grants no access and authorizes no provider action.

## Illustration in USD

Rates below are official list-price inputs checked on November 5, 2026 Pacific / November 6 UTC and recorded in the [GH27 cost amendment](https://github.com/coderabbit-demo/mmani-shopping-cart/issues/27#issuecomment-6678233952). Recheck the actual account, region and applicable rates before live use. The illustration assumes 168 hours of VM and NAT operation, 30 GiB provisioned disk, 120 Cloud Build minutes, one NAT VM and IP, and 10 GiB NAT processing. It assumes no free tier or account discount.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:927578cfa9b6f9d8a5eab9026e09e818b3966a1b6bbd75cda6d2b8620c4759d2 -->

| Item | Quantity and calculation | Rate and cost |
| --- | --- | --- |
| Compute Engine e2-standard-2, Iowa | 168 hours × $0.06701142/hour | [Compute pricing](https://cloud.google.com/products/compute/pricing/general-purpose): $11.25791856 |
| Balanced persistent disk | 30 GiB × 168 hours × $0.000136986/GiB-hour | [Disk pricing](https://cloud.google.com/compute/disks-image-pricing): $0.69040944 |
| Cloud Build default-pool e2-standard-2 | 120 minutes × $0.006/minute | [Build pricing](https://cloud.google.com/build/pricing): $0.72000000 |
| Cloud NAT, up to 32 VMs | 1 VM × 168 hours × $0.0014/VM-hour | [NAT pricing](https://cloud.google.com/nat/pricing): $0.23520000 |
| Cloud NAT external IP | 1 IP × 168 hours × $0.005/IP-hour | [NAT pricing](https://cloud.google.com/nat/pricing): $0.84000000 |
| Cloud NAT data processing | 10 GiB × $0.045/GiB | [NAT pricing](https://cloud.google.com/nat/pricing): $0.45000000 |
| Priced subtotal | Sum of priced line items | $14.193528 |
| Unpriced-service planning reserve | Storage, registry, logging, secrets, transfer, taxes and retention | $20.00 |
| Contingency | Planning reserve | $10.00 |
| Seven-day planning allocation | $14.193528 + $20 + $10 = $44.193528, rounded | $44.19 |
| Datadog US3 and CodeRabbit | Account usage billed separately | Account-specific; excluded from GCP allocation |

<!-- /coderabbit-ai-generated:v1 -->

This allocation is **not a complete quote, guaranteed spending cap, actual spend or evidence of permission readiness**. Charges and usage can exceed the reserves. Budget notifications are not a spending cap. CodeRabbit and Datadog billing are separate and not included in the GCP allowance illustration. Cloud Build artifact/source buckets, registry images, versioned state, logging, secret versions and operations, network transfer, taxes and retained resources need actual usage and account-specific pricing. Relevant references: [Cloud Storage](https://cloud.google.com/storage/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Cloud Logging](https://cloud.google.com/stackdriver/pricing) and [Secret Manager](https://cloud.google.com/secret-manager/pricing). The loopback forwarder shares the VM and adds no separate VM; its CPU and memory are within the illustrated VM usage.

## Tracking and stop handoff

1. Before any separately approved live work, review the saved plans, expected quantities, actual account rates, budget notification configuration, cost owner and stop/teardown procedures. The allowance is a limit for operator oversight; a notification does not enforce it.
2. When first consumption actually occurs, record the timestamp and seven-day deadline, resource identities, actual hours/build minutes/traffic and billing observations. Review consumption during the window, especially before another rehearsal; record actual stop times and the remaining charges after stopping.
3. Preserve protected state and the current and prior approved rollback artifacts. Stopping a VM does not remove its disk, retained storage or NAT configuration, which may continue to bill. Review resource ownership and applicable teardown plans before any changes; preserve shared APIs and unrelated access.

Live source, runtime, saved-plan and actual screenshot provenance belong in [trigger evidence](gcp-trigger-evidence.md). Sandbox checks and this worksheet do not establish live GCP acceptance.

<!-- /coderabbit-ai-generated:v1 -->


<!-- /coderabbit-ai-generated:v1 -->