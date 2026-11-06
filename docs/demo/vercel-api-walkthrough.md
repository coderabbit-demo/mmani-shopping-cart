<!-- coderabbit-ai-generated:v1 -->

# Isolated workflow health — presenter handoff

## Architecture and current gate

Only `coderabbitai/coderabbit-automation-demo` uses this stateless Node 24 API. The approved demo-only Personal US3 organization receives one direct HTTPS log submission per authorized, valid health request. The production Vercel Datadog installation serving coderabbit-bot remains untouched. No Marketplace attachment, drain, proxy, generic DD_API_KEY, application key or management credential is used by the function.

The function reads only project-sensitive WORKFLOW_DD_API_KEY for ingestion. The privately created dedicated key has not been enrolled or transferred to this source task. Its Remote Config/PAR defaults await separate narrowing approval. Do not put any key value in source, local environment files, exported Postman environments or screenshots. Provider setup and actual requests belong to the separately authorized harness workflow.

Health 200 means the authenticated request had valid server-derived Preview source identity and intake acknowledged its bounded log with HTTP 200 or 202. It does not prove indexing, a deployment readback, a distributed rate limit, cloud isolation or complete live acceptance. Source-only tests use synthetic credentials and injected fetch; they make no Datadog/Vercel call.

## Cloud setup and presenter onboarding

Use the existing standalone `tools/workflow-api` root and its Node 24 configuration; run tests/build/operations in the managed cloud. Root CI remains Node 22 compatible. Presenters install no Node, npm, Bash, Docker, SDK or server locally. Import the existing collection v2.1 and empty example environment from `tools/workflow-api/postman` into the approved Postman client.

Before any deployment, the harness must read back Vercel Authentication for all deployments, dedicated project/team identity and the immutable Preview's commit, deployment ID and hostname. Enroll the dedicated ingestion key privately in sensitive project settings only after verifying intended Personal US3 org/key identity and approved permissions. This document performs none of these operations.

Register each presenter with a unique non-PII actor, independently revocable random canonical base64url bearer (at least 32 random bytes), SHA-256 digest and strict UTC expiry in WORKFLOW_API_AUTH_JSON. Only the digest is server-held. Give each presenter an independently revocable project automation bypass. Put the two secret values in private Postman Vault entries workflow-api-bearer and workflow-api-bypass, restricted to the exact independently verified immutable Preview host. Never export Vault values or display request headers.

Populate DEMO_BASE_URL, EXPECTED_PREVIEW_HOST, EXPECTED_COMMIT and EXPECTED_DEPLOYMENT_ID from trusted provider readback; never infer the expected host from the supplied URL. The collection rejects aliases, wrong namespaces, credentials, paths, queries and redirects before sending. Use fresh cookies for the no-bypass denial case and run requests individually without retries.

Revocation requires removing the actor digest and redeploying the intended configuration, revoking that presenter's bypass separately, and retiring/restricting every still-accessible immutable Preview holding the old environment. A new deployment does not update an old deployment's captured secrets. Retain other presenters' independent access. Rotate/revoke the dedicated ingestion key through separately approved provider administration when required.

## Health and telemetry contract

Authentication and input/source validation run before delivery. Denied/invalid requests make no ingestion attempt. Missing/invalid WORKFLOW_DD_API_KEY, malformed/oversized event and anticipated transport failures produce generic no-store 503; genuine unexpected application errors retain generic 500. Neither is quote_failed. No error response or stdout event contains a key, raw request, provider response or exception text.

The sender accepts only the small health schema. Service workflow-api and site us3 cannot be overridden; unknown top-level or source fields fail closed. Datadog reserved status is info, message is health_checked, and HTTP status is separately http.status_code=200. Server-generated request ID, authenticated actor and validated source identity join stdout, intake payload and successful response. Stdout's numeric status remains the event's intended health status, not proof of intake acceptance; the HTTP result and independent indexing receipt are separate evidence.

One POST goes only to https://http-intake.logs.us3.datadoghq.com/api/v2/logs, with redirect:error and only JSON content type plus DD-API-KEY. The serialized payload is at most 2048 bytes. A two-second whole-attempt deadline includes fetch and response-body cancellation; ignored abort or hanging cancellation cannot hold the handler past that deadline. Late responses receive best-effort cancellation, with no retry. A non-cooperative injected transport cannot be forcibly terminated, but cannot turn timeout into success. No provider body is read or logged.

## Do / Say / See

1. Do: invoke the collection's denial cases. Say: platform and application protection are distinct. See: expected denials without telemetry delivery or reflected credentials.
2. Do: invoke Protected healthy Preview once. Say: this authenticates, pins source and awaits intake acknowledgement. See: protected 200 with matching request ID, source commit and deployment ID; preserve sanitized timestamp/identity evidence.
3. Do: independently search indexed Personal US3 logs for that exact request and corroborate provider deployment metadata. Say: acknowledgement is not indexing. See: actual matching searchable event and trusted deployment readback, or explicitly record the gate incomplete.

No live indexed proof or screenshots have been produced by this source implementation. Stop before quote/fault/monitor/Jira/Debug/action implementation until protected 200 plus matching indexed US3 intake is observed. PR/security/CI and native Verify remain required; source tests are not live acceptance. No publication, deployment, alert or production integration changes are performed here.
