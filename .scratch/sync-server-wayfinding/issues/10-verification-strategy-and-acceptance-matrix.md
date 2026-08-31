# Verification Strategy and Acceptance Matrix

Type: grilling
Status: resolved
Blocked by: 03, 06, 07, 08, 09

## Question

Which invariants belong in pure/unit, protocol contract, repository conformance, real WebSocket integration, browser component, desktop-main integration, Electron E2E, migration, restart/recovery, load, and security-isolation suites?

Define fixtures, fake clocks/IDs, failure injection, backend matrix, exact commands, required environment services, suite ownership, parallelism and timeout policy, flake controls, coverage of relay/authoritative coexistence with direct P2P, destructive-reset tests, and evidence required before each implementation phase can merge.

## Answer

Adopt an invariant-first, layered verification strategy. Each layer owns its boundary and must not be used as a substitute for a lower-level contract. The existing direct TCP/mDNS P2P suite remains an independent regression gate; server tests add WebSocket/libp2p coverage without making server routing a prerequisite for direct P2P.

### Suite ownership and required coverage

| Layer | Owner | Required assertions |
| --- | --- | --- |
| Pure domain and codec | Shared sync protocol package | Strict envelope decoding, tenant/device/generation authorization, frontiers, idempotency, reset semantics, relay no-history behavior. |
| Scripted duplex/session | Shared sync protocol package | Exact duplicate, reorder, truncation, delay, cancellation, disconnect and bounded-retry behavior at named barriers. |
| In-process libp2p | P2P/sync transport package | Protocol registration, Noise/Yamux, peer identity, credential checks, cancellation, and three-peer online relay using `@libp2p/memory`. |
| Real transport/front door | Sync-server integration project | Loopback WebSocket listen/dial, reconnect, policy-driven close, graceful shutdown, and one public port where HTTP reaches Hono and WebSocket Upgrade reaches the libp2p peer. |
| Repository/object conformance | Sync-server storage package | The same semantics across every selected metadata and object-store adapter, including restart and concurrent writers. |
| Hono API | Sync-server web package | Registration modes, login/session/CSRF, invite and pairing state, tenant authorization, policy changes, reset API, and stable error codes via `app.request()`. |
| Browser management flow | Sync-server Playwright project | Real cookies, navigation, forms, registration modes, pairing approval, mode warnings, deletion confirmation, keyboard access and responsive layout. |
| Desktop boundaries | Desktop main/preload/renderer packages | Injected server client, status stream, persistence, event exposure and renderer state independently at each process boundary. |
| Electron E2E | Desktop E2E project | Only cross-boundary acceptance: real server + browser page + packaged Electron, while retaining the existing direct-P2P fixture. |

The storage conformance matrix is mandatory for all four combinations: SQLite + filesystem, SQLite + S3-compatible, PostgreSQL + filesystem, and PostgreSQL + S3-compatible. SQLite/filesystem use temporary-file fixtures for the fast lane; PostgreSQL/SeaweedFS use pinned process fixtures for the real-service lane. No fake backend may masquerade as PostgreSQL or S3 in the real-service lane.

### Fixtures and determinism

- Inject clock, random bytes, IDs, retry schedules and cancellation signals. Pairing expiry and invite collisions must not depend on wall-clock timing or randomness in unit tests.
- Use unique temporary directories, database/schema names, buckets, account IDs, peer IDs and `/memory/<test-id>` addresses per worker. Disable mDNS in all server tests; test discovery only in the existing P2P-owned suite.
- Use Effect `TestClock` for workflow expiry/backoff. Do not use fake timers around real sockets; synchronize with readiness endpoints, emitted events and deterministic deferred barriers.
- Scope every node, listener, child process, database pool, object client and temporary directory with a finalizer. Teardown must also report leaked sessions, handles and unhandled rejections.

### Failure-injection matrix

The scripted harness exposes `afterHello`, `beforeApplyBatch`, `afterObjectPut`, and `beforeAck` barriers. Required cases are:

- handshake disconnect; duplicate, reordered, truncated, malformed and oversized frames;
- transaction failure after each repository statement;
- object upload failure before/during/after streaming and metadata/object ordering races;
- credential revocation and account mode disable while work is active;
- authoritative reset and deletion races, including late old-generation writes;
- clean shutdown and `SIGKILL` at named durable barriers, followed by restart;
- same IDs/keys presented by two tenants to prove authorization precedes repository access;
- held HTTP, sync, database and object operations during graceful shutdown;
- three-peer Relay forwarding with the receiving peer offline.

Every case must assert typed failure, bounded memory, resource cleanup, and absence of unauthorized or partial durable effects. Duplicate mutations produce one durable effect and a stable acknowledgement. No committed metadata may reference a missing object. Reset commits a generation/tombstone before cleanup, and cleanup is restartable/idempotent. Relay stores zero payload bytes and cannot recover while the other device is offline.

### Browser and Electron acceptance

Browser coverage includes disabled, invite-only and public registration; session expiry and CSRF; dual-confirmation pairing; Relay/Authoritative switching with the no-offline-recovery explanation; device revocation; authoritative reset with `CLEAR SERVER DATA`; and keyboard/accessibility/responsive checks.

Electron E2E must prove:

1. server URL persistence and reconnect after app restart;
2. pairing confirmed by both the real management page and client UI/preload/main stack;
3. server status, policy and reset events crossing main → preload → renderer;
4. existing two-device direct P2P pairing, offline sync and reconnect when no server is configured;
5. simultaneous direct P2P and server-peer use without duplicate application effects;
6. the actual Relay warning and Authoritative reset choice in client workflows.

Keep the existing two-Electron P2P fixture independent; add a separate server fixture and retain server stderr plus Playwright trace on failure.

### CI gates, flake policy and budgets

- Every change: pure/domain/protocol/Hono tests plus memory-peer and SQLite/filesystem integration.
- Pull requests: real WebSocket/front-door integration and PostgreSQL/SeaweedFS conformance; management-web changes also run browser Playwright.
- Server/client contract changes: focused packaged Electron + server E2E.
- Scheduled/release: crash/restart, Toxiproxy matrix, optional AWS/R2 compatibility smoke and load tests.

Pure tests may use Vitest workers. PostgreSQL/SeaweedFS/Toxiproxy and Electron run with one worker unless measured otherwise. Retries are zero. Fixed sleeps are prohibited; every wait has a diagnostic timeout and reports peer/session/job state. Failures retain process logs, selected multiaddresses, database job state, object listings and traces.

Target warm-cache budgets are: domain/protocol/Hono <15s per package; memory-peer + SQLite/filesystem <45s; real WebSocket + PostgreSQL + SeaweedFS <3m; browser management flow <2m; packaged Electron + server <6m; scheduled crash/Toxiproxy/cloud smoke <15m. Acceptance is based on explicit invariants for protocol, tenant, generation, credential, mode and deletion states rather than a blanket line-coverage percentage.

### Commands and merge evidence

The package must expose explicit lanes:

```sh
nix develop -c pnpm --filter @memorilo/sync test
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:integration
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:services
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:e2e
MEMORILO_E2E_HIDE_WINDOW=1 nix develop .#sync-server-test -c pnpm --filter @memorilo/desktop-e2e test:e2e --grep 'sync server'
```

`test:services` owns PostgreSQL, SeaweedFS and Toxiproxy process lifecycle. Root `pnpm test` remains free of mandatory external services; CI invokes the named service lane explicitly. Before each implementation phase merges, its owner must provide the focused command result, invariant/failure matrix evidence, retained diagnostics policy, and confirmation that direct P2P regression remains green. No phase is accepted solely because a retry passed.
