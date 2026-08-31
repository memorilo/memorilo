# Verification Harness and Failure Injection Research

## Conclusion

The Sync Server can be verified without making the server path the new default for device-to-device sync. Keep the existing TCP/mDNS P2P suite as an independent regression gate, extract a transport-neutral session contract, and test that contract through three progressively more realistic harnesses:

1. a scripted duplex/session harness for exact frame ordering and failure points;
2. same-process libp2p nodes using `@libp2p/memory` for protocol registration, Noise, Yamux, identity, and connection lifecycle;
3. loopback `@libp2p/websockets` plus the production external front door for real WebSocket and single-public-port acceptance.

Storage needs a shared conformance suite run against all four first-release combinations: SQLite and PostgreSQL metadata repositories, plus filesystem and S3-compatible object stores. PostgreSQL, SeaweedFS, and Toxiproxy can be launched as ordinary child processes from pinned Nix packages; Docker/Testcontainers must remain optional because no Docker-compatible runtime is installed in this workspace.

## Repository facts

- The root [Vitest workspace](../../../vitest.workspace.ts) includes `apps/desktop/*` and `packages/*`. A top-level `apps/sync-server` is not currently matched, so its package can run through Turbo but must either have its own Vitest config invoked by its package script or be added to the workspace pattern. Root `test` is serialized with `turbo run test --concurrency=1`; this is appropriate for native SQLite and process-backed service suites, but individual pure projects may still use Vitest workers.
- [`@memorilo/sync`](../../../packages/sync/package.json) currently has no WebSocket or memory transport dependency. Its [node tests](../../../packages/sync/src/node.test.ts) already create multiple real libp2p nodes on loopback TCP, explicitly dial ephemeral multiaddresses, exercise Noise/Yamux, disconnect/reconnect, mDNS pairing, and durable forwarding.
- A baseline run on 2026-08-29 with `nix develop -c pnpm --filter @memorilo/sync test` finished in about four seconds but failed the three-peer durable-forwarding case at its one-second polling deadline. Running that case alone passed in 0.57 seconds. This is evidence of a load-sensitive deadline, not evidence that the behavior is broken; it should be made event-driven or given an injected scheduler before it becomes a server regression gate. Retrying the CI job would only hide the problem.
- [Desktop main](../../../apps/desktop/main/package.json), [preload](../../../apps/desktop/preload/package.json), and [renderer](../../../apps/desktop/renderer/package.json) already own separate Vitest suites. Renderer and [`@memorilo/ui`](../../../packages/ui/vitest.config.ts) use Vitest Browser Mode backed by headless Chromium, so server management UI components can use the same React/StyleX/browser test pattern.
- The [Electron Playwright configuration](../../../apps/desktop/e2e/playwright.config.ts) deliberately uses one worker, zero retries, a 60-second per-test timeout, and `MEMORILO_E2E_HIDE_WINDOW=1`. The existing [P2P E2E fixture](../../../apps/desktop/e2e/tests/p2p-existing-database-sync.spec.ts) already launches two packaged Electron applications with separate user-data directories and SQLite files, pairs them through the preload API, verifies offline changes, and restarts both applications.
- [`SqliteTestDatabase`](../../../packages/editor-storage/src/sqlite-test-database.ts) already supports transaction rollback injection (`failNextBatch`), delayed reads (`beforeGet`), and VACUUM failure. [`@memorilo/effect-lifecycle`](../../../packages/effect-lifecycle/src/testing.ts) exposes a controlled `deferred`, and its resource-scope tests already cover acquisition races, reverse-order finalization, draining, retryable cleanup, and concurrent close.
- The current default devShell contains Node, pnpm, and just, but not PostgreSQL, SeaweedFS, Toxiproxy, Docker, or Podman. The dedicated test shell pins PostgreSQL, SeaweedFS, and Toxiproxy so process fixtures are available without global installation. MinIO is not used because the current Nix package is abandoned upstream and marked insecure.

## Harness layers and ownership

| Layer | Owner | What it proves | What it must not prove |
| --- | --- | --- | --- |
| Pure domain and codec | Shared sync protocol package | strict decoding, tenant/device/generation authorization decisions, idempotency, version vectors, reset semantics, relay no-history behavior | sockets, database drivers, UI |
| Scripted session | Shared sync protocol package | duplicate, reordered, truncated, delayed, and disconnected frames at exact barriers; cancellation and bounded retries | libp2p transport correctness |
| In-process libp2p | P2P/sync transport package | protocol handler registration, Noise/Yamux, peer identity, credentials, cancellation, three-peer relay while all peers are online | real WebSocket proxy behavior |
| Real transport | Sync server integration project | loopback WebSocket listen/dial, actual production front-door Upgrade routing, reconnect, policy-driven close, graceful shutdown | Electron/UI behavior |
| Adapter conformance | Sync server storage package | identical repository/object-store semantics for every configured backend | cross-store atomicity by assumption |
| Hono API | Sync server web package | auth, CSRF, registration policy, invitation/pairing state, tenant scoping, reset job API using `app.request()` | Node listener, cookies in a browser, proxy/TLS |
| Browser management flow | Sync server Playwright project | real cookies, navigation, forms, accessibility, registration modes, pairing approval, relay warning, deletion confirmation | Electron preload/main wiring |
| Desktop boundaries | Main, preload, renderer packages | one contract per boundary with injected server client and status stream | full cross-process behavior |
| Cross-application acceptance | Desktop E2E | packaged Electron + real server + real browser management page, persisted configuration, preload exposure, renderer state | exhaustive failure matrix |

Hono officially supports invoking an application with `app.request()` and inspecting the returned `Response`, so most HTTP authorization and policy cases need no listener. Playwright's `webServer` facility can launch one or more local processes, wait for readiness, and send `SIGTERM` followed by `SIGKILL`; use it for the browser suite and the packaged cross-application suite. The browser suite should address the same public origin used in production.

The one-public-port promise needs one dedicated integration test. Start the production front door on `127.0.0.1:0`; assert ordinary HTTP reaches Hono and a libp2p WebSocket dial through the same selected port reaches the server peer. Routing all HTTP Upgrade requests to the internal libp2p listener and non-Upgrade requests to Hono is sufficient; a URL path is not required. Keep a direct internal WebSocket test too, so proxy failures and libp2p failures remain distinguishable.

## Deterministic peer harness

`@libp2p/memory` is explicitly intended for connecting two libp2p nodes in the same process. Configure explicit `/memory/<test-id>` addresses, disable mDNS, and inject fixed test peer identities. This removes ports and discovery from protocol tests while retaining the libp2p upgrade stack. Use a unique address per test and close every node through an Effect scope/finalizer.

Memory transport is still too high-level for frame mutation. The transport-neutral sync session should accept framed read/write ports (or a duplex stream service), clock, random/id source, authorization service, and cancellation signal. Its test implementation should expose barriers such as `afterHello`, `beforeApplyBatch`, `afterObjectPut`, and `beforeAck`; it can then deterministically:

- replay a frame with the same message/change id;
- deliver sequence 2 before sequence 1;
- end in the middle of a length-delimited frame;
- pause a writer until revocation, reset, mode change, or shutdown occurs;
- reject or interrupt one direction while leaving the other direction observable.

Do not use fake timers around real libp2p sockets. Use Effect `TestClock` or an injected clock for retry/backoff/expiry at the workflow layer, then use real time with explicit event barriers and `AbortSignal.timeout` only in transport integration tests.

## Storage conformance and temporary services

Define two reusable conformance suites rather than backend-specific examples:

- `MetadataRepositoryContract`: migrations, tenant scoping, transaction rollback, idempotent mutation application, optimistic generation checks, credential revocation, mode-policy reads, deletion/reset state, restart, and concurrent writers.
- `ObjectStoreContract`: tenant/key isolation, byte-for-byte put/get, content length/type metadata, duplicate put, missing key, delete/idempotent delete, streaming cancellation, and restart.

Run the suites as follows:

| Adapter | Fast PR fixture | Real integration fixture | Required failure controls |
| --- | --- | --- | --- |
| SQLite | temporary file (use `:memory:` only for pure query tests) | close/reopen the same temp file | transaction hook throws; process killed after a durable barrier; file permissions/read-only path |
| PostgreSQL | none masquerading as PostgreSQL | `initdb` + `pg_ctl` in a unique temp directory and Unix socket/ephemeral TCP port | transaction hook; `pg_terminate_backend`; stop/restart server; Toxiproxy reset/timeout |
| Filesystem | unique `mkdtemp` root | close/recreate adapter on same root | injected fs port errors, rename/write failure, permissions, interrupted stream |
| S3-compatible | in-memory fake only for workflow unit tests | SeaweedFS S3 gateway with a unique data directory and bucket | throwing client wrapper, Toxiproxy limit/reset/timeout, SeaweedFS stop/restart |

PostgreSQL documents `initdb` for creating a cluster and `pg_ctl` for starting, waiting for, stopping, and restarting it. A global setup process can create one cluster per test worker, create a database/schema per conformance case, and remove it in a finalizer. Do not substitute PGlite or SQLite for this lane: neither verifies the selected PostgreSQL driver, SQL dialect, locking, or transaction behavior.

SeaweedFS exposes an S3-compatible gateway backed by an isolated local master, volume and filer. Launch it once per service-test worker with a unique data directory and allocated loopback ports; wait on an S3 API operation rather than logs or sleeps. Use the same public object-store port against SeaweedFS that production uses against S3/R2. The local gateway proves the common S3 contract; optional credentialed scheduled smoke tests against AWS S3 and R2 should cover endpoint/signing/provider differences, but they must not be required for local or pull-request runs.

Testcontainers is a valid optional CI implementation when a runner already provides Docker, Podman, Colima, or Rancher Desktop. It is not the default here: none is installed, and Testcontainers' own runtime documentation requires configuring one of those compatible runtimes. A pinned Nix process fixture is both available on this macOS workspace and easier to reproduce without global state.

Toxiproxy is also available in `nixpkgs` and its upstream API supports ephemeral listen ports plus deterministic timeout, reset-peer, bandwidth, slicing, and byte-limit failures. Put it between the application and PostgreSQL/SeaweedFS only in the service-failure lane. Application-level scripted fakes remain the faster and more precise way to hit every logical barrier.

## Failure-injection matrix

| Failure | Injection point | Required assertions |
| --- | --- | --- |
| Disconnect before/after handshake | scripted duplex abort; real `hangUp`/WebSocket close | no unauthorized apply; session resources close; reconnect resumes from durable vector, not from assumed delivery |
| Duplicate frames/changes | replay exact encoded frame and same mutation id | one durable effect, stable acknowledgement, no sequence advance twice |
| Reordered frames | scripted reader swaps frames | buffer only if protocol explicitly permits it; otherwise typed protocol rejection and closed stream, never partial apply |
| Truncated/oversized/malformed frame | cut bytes or exceed configured limit | typed error, bounded memory, connection closed, no repository call |
| Partial metadata persistence | throw after each repository statement inside transaction | rollback leaves generation/vector/content metadata mutually consistent on SQLite and PostgreSQL |
| Object upload failure | fake object store throws before/during/after stream; Toxiproxy byte limit | no committed metadata may reference a missing object; retry is idempotent; orphan handling follows the chosen reconciliation policy |
| Credential revocation | gate an active operation, revoke credential, then release | new sessions rejected; active session stops admitting work; already admitted work follows the documented drain/generation rule |
| Global/account mode disable | update policy while relay/authoritative sessions are open | capability response changes; new session rejected with stable code; existing session drains/closes; no silent fallback |
| Authoritative reset race | gate writes at repository/object barriers; increment account data generation | late old-generation commits fail; credentials/device state follows the chosen reset policy; deleted data cannot be resurrected silently |
| Delete/object cleanup race | pause deletes and restart process | deletion job is restartable and idempotent; account remains unavailable/marked deleting until metadata and object reconciliation completes |
| Restart recovery | close cleanly and `SIGKILL` child at named durable barriers | server peer identity, migrations, jobs, vectors, policy, and authoritative data recover; relay data does not appear after restart |
| Tenant isolation | same ids/keys for tenant A and B; swap credential/route ids | no cross-tenant read, write, list, ack, object key, metric label, or deletion; authorization happens before repository access |
| Graceful shutdown | hold HTTP request, sync stream, DB call, and object stream with deferred barriers | admission closes first; accepted work drains until deadline; remaining work is interrupted; listeners close before dependencies; repeated close shares/retries safely |
| Relay offline limitation | three peers A-server-B, then disconnect B before A sends | repository/object-store spies observe zero payload persistence; B cannot recover with only server online; API/UI clearly reports “online relay only, no offline recovery” |

For DB + object-store workflows, the harness must test every boundary because there is no cross-resource transaction. A robust ordering normally uploads a content-addressed object first and commits its reference second, tolerating reclaimable orphans but never a durable reference to a missing object. Reset/deletion normally commits a generation/tombstone first and performs object cleanup as a restartable job. The final design ticket should lock those invariants; the harness should expose a named failpoint after each step.

## Acceptance cases and the Electron boundary

Keep these below Electron E2E:

- protocol encoding, duplicate/reorder behavior, relay online-only semantics;
- all repository/object-store conformance and service failures;
- Hono registration modes, login, invitation, pairing state machine, policy, reset API, and tenant authorization through `app.request()`;
- server process startup/restart/shutdown and direct/front-door WebSocket integration;
- React management UI and desktop settings states with fake typed clients;
- main-process server-client orchestration, preload method/event exposure, and renderer state independently.

Electron E2E is required only when the acceptance condition crosses real Electron boundaries:

1. entering and persisting the server URL in the packaged desktop app, then reconnecting after app restart;
2. completing the same pairing session through both the real server web page and the real client UI/preload/main stack;
3. observing a real WebSocket server status/policy/reset event through main, preload, and renderer;
4. proving existing two-device P2P still pairs, syncs, goes offline, and reconnects when no server is configured;
5. proving a client can use direct P2P and a server peer concurrently without duplicated application effects;
6. displaying the relay no-offline-recovery warning and authoritative reset choice in their actual user workflows.

Use the existing two-Electron fixture as the P2P regression case. Add a separate server fixture rather than rewriting it to route through the server. The cross-application pairing test can use Playwright's normal browser page for the Hono-served web UI alongside `_electron`; start the server with Playwright `webServer` or a worker-scoped fixture, and retain server stderr plus Playwright trace on failure.

## Flake controls and runtime budgets

- Bind internal listeners to port `0` and publish the chosen address; use unique temp directories, database/schema names, bucket names, peer ids, and account ids per worker.
- Disable mDNS in all server tests. Test mDNS only in the existing P2P-owned suite; explicit dialing makes every server test independent of LAN/multicast state.
- Inject clock, random bytes, ids, and retry schedule. Never depend on wall-clock pairing expiry or random invite collisions in unit tests.
- Synchronize with observable events/deferred barriers/readiness endpoints, not fixed sleeps. Every wait has a diagnostic timeout and reports peer/session/job state.
- Use zero retries. Keep traces, process logs, selected multiaddresses, database job state, and object listings on failure.
- Run PostgreSQL/SeaweedFS/Toxiproxy and Electron suites with one worker unless measurements show safe parallelism. Pure protocol and Hono `app.request()` tests may remain parallel.
- Scope every node, listener, child process, database pool, object client, and temp directory so cleanup runs on success, failure, and interruption. On test teardown, reject leaked sessions, handles, and unhandled rejections.

Target budgets after dependency/build caches are warm:

| Gate | Target | Policy |
| --- | ---: | --- |
| protocol/domain/Hono unit | under 15 seconds per package | every change |
| memory-peer + SQLite/filesystem integration | under 45 seconds | every change |
| real WebSocket + PostgreSQL + SeaweedFS conformance | under 3 minutes total, one worker | pull request |
| server browser management flow | under 2 minutes | pull request when server web changes |
| focused packaged Electron + server acceptance | under 6 minutes including one desktop pack | pull request when desktop/server contract changes |
| crash/restart, Toxiproxy matrix, optional AWS/R2 smoke | under 15 minutes | scheduled and release gate |

The current P2P suite's roughly four-second runtime fits the fast gate, but its load-sensitive one-second deadline must be removed before enforcing this budget.

## Focused commands

Current commands, from the repository root:

```sh
nix develop -c pnpm --filter @memorilo/sync test
nix develop -c pnpm turbo run test --filter=@memorilo/desktop-main
nix develop -c pnpm turbo run test --filter=@memorilo/desktop-preload
nix develop -c pnpm turbo run test --filter=@memorilo/desktop-renderer
MEMORILO_E2E_HIDE_WINDOW=1 nix develop -c pnpm test:e2e
```

Proposed package scripts should make service cost explicit rather than hiding external processes inside ordinary unit tests:

```sh
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:integration
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:services
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:e2e
MEMORILO_E2E_HIDE_WINDOW=1 nix develop .#sync-server-test -c pnpm --filter @memorilo/desktop-e2e test:e2e --grep 'sync server'
```

The `sync-server-test` devShell pins PostgreSQL, SeaweedFS, and Toxiproxy. `test:services` owns their process lifecycle and adapter conformance; `test:e2e` owns a built server web UI and the production front door. Root `pnpm test` continues to run tests that require no external service, while a named Turbo task runs the service lane in CI.

## Primary sources

- Hono, [Testing](https://hono.dev/docs/guides/testing): `app.request()` accepts Request/input data and returns a Response without a network listener.
- js-libp2p, [`@libp2p/memory`](https://github.com/libp2p/js-libp2p/tree/main/packages/transport-memory): the transport is intended for same-process test nodes.
- js-libp2p, [`@libp2p/websockets`](https://github.com/libp2p/js-libp2p/tree/main/packages/transport-websockets): real WebSocket listen/dial transport and multiaddress configuration.
- Playwright, [Web server](https://playwright.dev/docs/test-webserver): readiness, multiple processes, environment, and graceful/forced shutdown support.
- Playwright, [Electron](https://playwright.dev/docs/api/class-electron): launching Electron and controlling its windows from Playwright.
- PostgreSQL, [`initdb`](https://www.postgresql.org/docs/current/app-initdb.html) and [`pg_ctl`](https://www.postgresql.org/docs/current/app-pg-ctl.html): temporary cluster creation and controlled server lifecycle.
- PostgreSQL, [Server signaling functions](https://www.postgresql.org/docs/current/functions-admin.html): backend cancellation and termination for connection-failure tests.
- SQLite, [Transactions](https://www.sqlite.org/lang_transaction.html): transaction/rollback behavior to verify in the SQLite adapter.
- SeaweedFS, [S3 API documentation](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API): local S3-compatible gateway and client access.
- Toxiproxy, [README and HTTP API](https://github.com/Shopify/toxiproxy): deterministic reset, timeout, slicing, byte-limit, latency, and ephemeral-port controls.
- Testcontainers for Node, [supported container runtimes](https://node.testcontainers.org/supported-container-runtimes/): Docker-compatible runtime requirements and macOS Podman/Colima configuration.
- Effect, [TestClock](https://effect.website/docs/testing/testclock/): advancing Effect time without wall-clock sleeps.
