<!-- coderabbit-ai-generated:v1 -->

# Local Docker monitoring

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:42701160277884620bb6a22f18689df5e8d497f6c690e248d1797ec555647a6e -->

This is a Mac Docker Desktop workflow for the fixed `deskdrop-mmani-local` project and `127.0.0.1:3177`. The app and sandboxed browser checker use private networks; only the Agent has the intake secret and Docker socket. Docker socket access gives the Agent effective daemon control. Container filters select this project's app, forwarder, checker and runner; they do not guarantee that aggregate Docker or host telemetry is absent. No Agent or DogStatsD port is published. Docker Desktop runs containers inside a Linux VM; this is not evidence of the GCP Linux firewall, IAM or deployment.

<!-- /coderabbit-ai-generated:v1 -->

## Before starting

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:0902067044cdf684f4e3b2fcc721dad43d45811e2613ced162dd94f929d71131 -->

Use the reviewed clean committed checkout, macOS Docker Desktop and the already approved pinned images. Check that the Docker Desktop socket `~/.docker/run/docker.sock` exists and port 3177 is free. No host bootstrap, cloud login or registry publication is used. The controller checks out no other branch. Its build consumes a Git archive, checks the clean commit and architecture, stores local image IDs and the reviewed seccomp digest, and never treats those IDs as registry receipts. Existing runtime files are preserved; a conflicting build record stops the operation. Before recording a build as pending, the controller verifies the two existing Docker Desktop CLI plugin links and executable identities, creates only corresponding links in its private credential-free Docker config, and checks `buildx version` and `compose version`. It accepts the Docker Desktop executables under `/Applications/Docker.app/Contents/Resources/cli-plugins/`; an absent, changed or unsafe plugin or an existing `config.json` in the isolated directory stops preparation. Inspect and reconcile any existing pending build journal before retrying; never assume an unknown build failed or delete its state.

<!-- /coderabbit-ai-generated:v1 -->

The Mac-only `.env.demo.local` is a regular current-user-owned mode-0600 file containing `DD_API_KEY`, `DD_APP_KEY` (or `DD_APPLICATION_KEY`) and optionally `DD_SITE=us3.datadoghq.com`. Invoke the Node commands directly: the controller reads the file privately and rejects blanks, conflicting inherited values, mismatched aliases and other sites. Do not print, export, commit, transfer or attach its contents. The application key remains in the monitor controller; only the intake key is copied into the protected `~/.deskdrop-mmani-local/secrets/intake` file for the Agent. The protected directory, build receipts, monitor journal and intake file remain after shutdown for explicit operator reconciliation.

## Notification-free setup

These operations require the separately authorized Mac execution and a complete monitor inventory, plus `monitors_read`, `monitors_write`, `monitors_downtime` and any applicable editor or muter access. Inventory visibility must be confirmed for the account before using `--all-monitors-visible`. From the repository root:

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7255d299b82f11613e326b5fff913eae396fc7e43b60e668ef38a34471c97f23 -->

```sh
node scripts/demo/local.mjs preflight
node scripts/demo/local.mjs build
node scripts/demo/datadog-monitors.mjs validate
node scripts/demo/datadog-monitors.mjs plan --all-monitors-visible
```

Review and copy the non-secret JSON plan, then run `node scripts/demo/datadog-monitors.mjs save-plan`, paste the exact reviewed JSON on standard input and send EOF. The command exclusively creates the protected plan file and refuses an existing file or symlink. Then run:

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f0f9353756dd7b6f04a7372b16e5533401ec7ad876e8d780c13702b1a467592c -->

```sh
node scripts/demo/datadog-monitors.mjs apply --all-monitors-visible
node scripts/demo/local.mjs start
```

Keep `start` in the foreground. After the ready result, from a second terminal run:

```sh
node scripts/demo/local.mjs status
node scripts/demo/local.mjs check
```

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:8c41c50c22714478148905108ab3dd6cb16cd5510a5475a47d1b7cfd181d235c -->

The apply operation creates a uniquely tagged, scoped initial downtime before creating the three monitors and transfers suppression to verified exact-ID downtimes. The US3 client uses a ten-second total request deadline; a timed-out write has an unknown outcome and must be reconciled rather than retried automatically. Query validation is not ingestion or permission proof.

<!-- /coderabbit-ai-generated:v1 --> Check US3 Agent intake, monitor readback, every downtime match and an initial healthy heartbeat group. Do not claim missing-data coverage for an unseen group. Confirm that no notification rule sends an event during setup. The documented Datadog matching contract does not by itself prove there is no propagation window in this account.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:70f1b253dd43ebcb72135405cb376153473ba978a124226b404afe0573223bfe -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:407e6f1cf24efd9b3f9f2276f6e0886bd7ec091bfae2063f8ca957c9950e5cdf -->

Run `node scripts/demo/local.mjs start` in the foreground and wait for its ready result; use `status` and `check` from another terminal. The Mac controller independently schedules HTTP, checkout and heartbeat every 30 seconds. It creates a uniquely named one-shot checker container for each journey through the validated local Docker CLI. At the 25-second deadline or interruption, it inspects the exact container identity, kills it if needed and removes only that container. An unknown outcome blocks later journeys until reconciliation. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d0b327f3b179b10a53189523f7f15e2a9577c17335c60e85286a9079a4c2065b -->

The unprivileged runner relays service checks over private UDP when the controller asks; it has no Docker socket or credentials. For a failed journey the controller reads a bounded allowlisted observation from the verified stopped container before removing it, then sends it in the DogStatsD service-check message with the source and local image ID. If the observation is unavailable, the message says so. It contains no page bodies, form fields, browser errors or credentials. The Agent's filter also permits exact owned one-shot names, but short-lived container log collection is not assumed. A local result or UDP send does not prove US3 ingestion or native payload mapping.

<!-- /coderabbit-ai-generated:v1 --> The five-second HTTP check and heartbeat continue independently while a journey is stalled. Each journey uses a fresh browser context and synthetic shopper details and checks both items, DESK15, express delivery, the $97 receipt and history. Actual Docker Desktop cleanup and restart evidence remains a Mac gate.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

## Control and recovery

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:7ca6d8e5487a10b01d7ea37eeab60546da04d6ff78a7daa84a519c58bba695f5 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3fdf8fd357a8c0c2c9fc1ddae4794ae4a1765e9fb7c745b10f2cbafe5aa25b02 -->

From a second terminal, `node scripts/demo/local.mjs stop` asks the foreground controller to suppress owned monitor notifications, clean the current journey and stop verified project containers. Ctrl+C or SIGTERM requests the same shutdown. If suppression or cleanup is unknown, the controller reports incomplete shutdown and retains the journal. `app-stop`, `app-restart`, `checker-stop`, `checker-restart`, `runner-stop` and `runner-restart` intentionally leave notifications as configured; use them only in an approved window. Stopping the checker pauses journeys while the controller continues heartbeat; stopping the relay interrupts telemetry. macOS sleep, Docker shutdown and network loss interrupt telemetry. No always-on or GCP isolation guarantee is implied.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

An unknown API, cancellation or container outcome leaves a pending journal or lock. Stop and inspect actual monitor IDs, downtime matches and project containers before any retry; never retry a create blindly, adopt a matching name, mute unrelated monitors or remove another project's resources. Preserve state and report ambiguity. The initial tag downtime may remain until each exact-ID downtime is verified. The final stop leaves owned resources and the restricted intake file in place rather than deleting unrelated data.

Notification enablement is a separate approval. A protected `~/.deskdrop-mmani-local/notification-approval.json` must contain `approved`, `scopeVerified`, `owner`, numeric `usageLimit`, ISO `windowStart` and `windowEnd`, ISO `healthyObservedAt`, sanitized `evidence`, and the exact three `monitorIds`. The operator must independently confirm fresh US3 ingestion and native scope; the command also checks current monitor group state. Within the approved window, `node scripts/demo/datadog-monitors.mjs enable` cancels only verified owned-ID downtimes. `node scripts/demo/datadog-monitors.mjs disable` reinstates only owned-ID suppression. A partial or unknown outcome requires inspection; it is not a clean activation or teardown.

Live automation alignment, webhook setup, notifications, fault seeding and rehearsal remain separate approvals. Native CodeRabbit QA tests its own sandbox and cannot reach the Mac's localhost. Actual Docker Desktop secret-backend permissions, collection filters, telemetry, two-result transitions and two-minute missing-data behavior require Mac/US3 evidence before this phase is accepted. Private GCP infrastructure, reboot, telemetry and publication requirements remain pending separately approved live fixtures.
