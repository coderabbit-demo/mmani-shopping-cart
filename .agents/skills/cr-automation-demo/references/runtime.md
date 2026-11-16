<!-- coderabbit-ai-generated:v1 -->

# Runtime preparation and resumption

## Prerequisites and identity

Use the retained macOS Docker Desktop installation, Node >=22.6, Bash >=3.2, Git and existing approved private credentials. Validate availability/version without reinstalling tools, sourcing credentials, printing environment values or enabling shell tracing. Linux/AMD64 emulation on Apple Silicon is expected; pinned container versions/digests come from the runtime checkout's deploy/runtime-versions.json and Compose source, not the host Node version.

If Docker Desktop is stopped, use available host-app/computer tools to open it. Poll at most every five seconds for 120 seconds for the owner-controlled real socket at ~/.docker/run/docker.sock and a responding daemon. Do not substitute another daemon/context, install Docker, or modify socket permissions. Missing host access or tools means BLOCKED with the specific prerequisite.

Keep two roots separate: the checkout supplying this skill, and the runtime checkout supplying the controller/images. Discover candidates from owned Docker Compose metadata (project deskdrop-mmani-local, service labels, working-directory/config-file metadata where present) and protected build receipts under ~/.deskdrop-mmani-local. Do not dump full docker inspect output: select identity fields, not environment/config secrets. Metadata is a lead, not proof.

For a candidate runtime root, verify its real path and origin identifies coderabbit-demo/mmani-shopping-cart, then verify committed HEAD and a clean working tree, including untracked source. Cross-check protected build-COMMIT.json and checker-seccomp-COMMIT.json with actual app/checker image IDs, Linux/AMD64 architecture, org.opencontainers.image.revision and the source's profile hash; verify the Agent pinned digest too. Bind the actual controller process/session working directory and source to these identities. Do not infer ownership from a tag, directory name, old screenshot or stale receipt alone. Never switch, dirty, reset, or install this skill into the pinned runtime checkout. No old source hash or presenter-specific path is prescribed.

Inspect protected state only through source-compatible ownership/mode/no-symlink checks; keep its contents private. State is not disposable. Before any mutation classify controller, operation, journey, trigger and monitor state. Missing, malformed or ambiguous identity is BLOCKED.

## Select the path

### Running controller: reuse

From the verified runtime root:

```bash
node scripts/demo/local.mjs status
node scripts/demo/local.mjs check
node scripts/demo/datadog-monitors.mjs status
bash scripts/demo/trigger-alert.sh status
bash scripts/demo/trigger-alert.sh plan
```

These do not authorize a rehearsal. Reconcile readbacks with runtime metadata and private integration configuration. Do not run local.mjs preflight/build against a live runtime: their port-free guard must reject occupied port 3177. An app response and healthy containers cannot establish controller check freshness, telemetry or routing.

A pending operation.json with name start is expected during a live foreground controller. Accept it only when the live controller's operationIdentity matches the protected local.lock and journal operation ID, inode/device binding, runtime commit and appImageId, with the identified presenter Terminal/process still alive. Pending build/unknown operation, mismatched identity or missing controller is not this exception.

### Fully stopped clean installation

Require no active controller, no running owned containers, port 3177 free, no unresolved operation/trigger/monitor/journey work or stale ownership artifacts. Stopped owned containers may remain if the official controller validates them. Check the private .env.demo.local file at the verified runtime root: regular file, current owner, mode 0600, no symlink, one link. Use the existing loadCredentials parser from local.mjs without printing or exporting its result; it validates allowed names, duplicates, conflicting inherited variables and US3. Never source or copy the file. Report metadata/parser failure without values.

Reuse valid matching build/profile receipts and images. Only for an unbuilt clean approved source, with the owned runtime fully stopped and port free, use:

```bash
node scripts/demo/local.mjs preflight
node scripts/demo/local.mjs build
```

An existing build record or image tag is not permission to overwrite/rebuild; report mismatches for reconciliation. The official build prepares Docker Desktop plugins, archives committed source and uses pinned container tooling; it does not need host application npm install. Missing pinned images/receipts are preparation blockers until the narrowly scoped build is authorized. Preserve existing data and receipts.

The separate scripts/demo/preflight.mjs is a broader diagnostic: it reads credentials from process environment, not .env.demo.local, and checks optional tools/auth such as gh. Do not run it naively or turn optional checks into a CodeRabbit CLI/login prerequisite.

Before starting, require exact owned monitor configuration, active effective suppression and no unresolved provider writes, as described in integrations.md. A suppressed No Data/Alert state alone does not block starting the healthy retained runtime: start calls verifyProtectedMonitors(false), whose ensureSuppressed checks ownership and protection without requiring OK telemetry. Final READY still requires all three monitors OK, fresh local checks and trigger plan ready after bounded convergence. After these pre-start checks pass, start in a presenter-owned Terminal that survives the agent/tool turn: change to the verified runtime root and run `node scripts/demo/local.mjs start`. It loads the existing private env file itself. Keep the Terminal open; do not rely solely on a tool PTY, background shell or launchd/login service. Record Terminal/session and controller identity. Do not disable Mac locking/passwords; bounded keep-awake is allowed only on request.

The controller uses --pull never and starts app, forwarder, runner and agent; a temporary checker runs journeys. Normal telemetry/checks are intentional. Startup requires suppression; its failure/shutdown protection can restore missing owned suppression, so unresolved monitor writes/drift must block before startup. Do not use start as a provider repair mechanism.

### Interrupted or orphaned controller

If containers remain but controller status is unavailable, and local.lock/control.sock or a pending operation remains, this is an interrupted installation, not a clean stop. Source provides no general orphan-controller recovery command. Preserve state and report BLOCKED, even with four healthy containers.

Next diagnostic: identify whether the presenter Terminal/controller still exists, select only owned Docker identity/state fields, and compare protected operation ID/lock inode and runtime source with receipts. Report the exact failed relationship privately. Do not retry start, delete locks/sockets/journals, force-remove containers, or treat trigger recover as a universal restart. Active or unknown trigger/monitor writes stop mutation; ambiguous writes must not be retried.

## Fresh evidence, bounds and shutdown

Allow the source's 90-second startup readiness bound, then observe convergence for at most 180 seconds at five-second intervals. The trigger plan has its own 60-second preparation bound. Stop at the bound; report stale/missing evidence instead of spinning. Fresh local availability and checkout must each be 0 with timestamps within 60 seconds, telemetry sent, journeyBlocked=false and controlBusy=false, plus successful local check. Verify four persistent owned services, their source/image IDs and controller lifetime separately from stdout ready.

For final READY, require all three monitors OK and suppressed, plus trigger plan ready/blockers empty; do not infer these from local check. Endpoint is http://localhost:3177/ on the presenter's Mac.

Leave the intentional runtime and its Terminal open at handoff. Give clean shutdown from the same verified root: `node scripts/demo/local.mjs stop`. It confirms owned monitor suppression before stopping services. Wait for stopped response, controller exit and closed port; suppression failure can deliberately leave services running. Report incomplete shutdown rather than killing processes/containers or removing protected state.
