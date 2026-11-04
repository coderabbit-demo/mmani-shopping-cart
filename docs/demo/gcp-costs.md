<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:8b8c8b445ed862daa1a10e4f187bcbf6832d598e39e0b9e079260852161bc5df -->

# Phase 2 cost worksheet — incomplete

No price, spend limit, owner or deployment window has been approved. The operator must fill in dated prices and approve this worksheet before any apply. A budget notification does not enforce a spending cap.

As observed 2026-11-04, USD, before taxes or account-specific discounts. Figures are nonbinding and must be rechecked for the account and intended duration.

| Item | Quantity for estimate | Rate and cost |
| --- | --- | --- |
| Compute Engine e2-standard-2, us-central1-a | One VM × planned hours | [Iowa on-demand rate](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types) $0.06701142 per hour: approximately $48.92 for 730 hours. |
| Balanced persistent boot disk | 30 GiB | Google lists $0.000136986 per GiB-hour for balanced provisioned space in its default pricing table; approximately $3.00 per 730-hour month. Confirm the region before apply. |
| Cloud NAT gateway | One VM × planned hours | $0.0014 per VM-hour for up to 32 VMs: $1.022 for 730 hours. |
| Cloud NAT external IP | One × planned hours | $0.005 per IP-hour: $3.65 for 730 hours. |
| Cloud NAT processing | Inbound and outbound GiB | $0.045 per GiB. |
| Artifact Registry | Stored GiB and transfer | Variable; confirm regional rates and free-tier eligibility. |
| GCS state | Current and versioned objects and operations | Variable; confirm regional storage, operation and retention rates. |
| Logging and data transfer | Ingested and retained volume, egress | Variable; confirm account tier and regional rates. |
| Secret Manager | Secret versions and access operations | Variable; confirm access and active-version rates. |
| Datadog US3 and CodeRabbit | Account usage | Account-specific; confirm applicable contracts and usage. |

Illustrative subtotal for 730 hours is approximately $56.59 for the VM, 30 GiB disk, NAT gateway and one NAT IP. It excludes NAT data, registry, state, logging, Secret Manager, data transfer, Datadog, CodeRabbit, taxes and account discounts. Actual charges can differ.

The loopback forwarder shares the existing VM and exact app image; it adds no VM, public ingress, package or separate paid service. Its memory/CPU remain part of the fixed VM estimate.

Record the source date, applicable pricing tier, estimated hours and traffic, total, contingency, owner, rehearsal period, teardown deadline and approved spend limit.

State versions and other retained resources may continue to accrue charges after demo teardown. Estimate and verify all applicable taxes and variable charges separately.

Primary sources: [Compute pricing](https://cloud.google.com/products/compute/pricing), [disk pricing](https://cloud.google.com/compute/disks-image-pricing), [Cloud NAT pricing](https://cloud.google.com/nat/pricing), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing), [Cloud Storage pricing](https://cloud.google.com/storage/pricing), [Cloud Logging pricing](https://cloud.google.com/stackdriver/pricing), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [Datadog pricing](https://www.datadoghq.com/pricing/) and [CodeRabbit pricing](https://www.coderabbit.ai/pricing).


<!-- /coderabbit-ai-generated:v1 -->