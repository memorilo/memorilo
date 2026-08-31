# Migration Sequence and Implementation Tickets

Type: grilling
Status: resolved
Blocked by: 08, 10

## Question

What ordered implementation ticket graph delivers the Sync Server safely while destructive changes are allowed?

Produce execution tickets with explicit owners, public interfaces, dependency order, deletion/refactor scope, schema/protocol cutovers, backend adapter milestones, web/client integration, focused verification, repository-wide gates, operational acceptance, and rollback/recovery checkpoints. Identify which current ADRs are superseded and which decisions need new ADRs before implementation begins.

## Answer

Implement the server in an infrastructure-first sequence with a small number of independently verifiable deep-module tickets. The implementation is allowed to be destructive: there is no compatibility layer, no runtime provider switching, and no code rollback guarantee after a schema migration. A failed migration or deployment is recovered from a verified backup or by re-syncing from authorized client peers.

### Target package and directory boundaries

- Rename `packages/sync` to `packages/sync` in one atomic workspace change. Do not keep an `@memorilo/sync` re-export.
- `packages/sync` is the only new shared package. It owns the transport-neutral `/memorilo/sync/1` protocol (new semantics despite the unchanged path), codec/session, domain models, namespace frontiers, generations, errors, repository/object-store ports, and canonical Drizzle schema specification. It must remain usable by Electron and React Native and must not import Hono, Node listeners, React, or concrete drivers.
- `apps/sync-server` owns Node startup, Hono, libp2p server composition, authentication/pairing, management web, and concrete adapters. Keep concrete infrastructure outside `src/`:

  ```text
  apps/sync-server/
    infrastructure/
      database/{sqlite,postgres}
      object-store/{filesystem,s3}
      auth/
      http/
    src/{config,domain,runtime,index.ts}
    web/
  ```

  `infrastructure` implementations depend only on `packages/sync` ports; database and object-store implementations do not import one another. `web` contains the React/Vite management UI and its build entry.

### Configuration and migration rules

- Provider selection is configuration-only: `metadataDatabase: sqlite | postgres` and `objectStore: filesystem | s3`. The two providers are independent and may be changed only while the service is stopped; the program does not discover, copy, or migrate data between providers.
- Default development configuration binds `127.0.0.1:6000`, uses SQLite + filesystem, and has registration disabled. The bind address, port, providers, paths/credentials, and registration mode remain configurable. Production still places Hono and libp2p behind the single externally visible HTTPS/WSS port defined by Issue 08.
- Schema migrations run automatically at startup for the selected provider. Startup first acquires the migration lock, applies pending Drizzle migrations transactionally where the provider supports it, records the schema version, then validates provider health, bucket/root, permissions and required invariants. Any mismatch or failed migration rejects startup; there is no automatic fallback provider.
- Provider-to-provider data movement is explicitly an operator responsibility performed offline. The server only opens and reads the provider named in its current configuration.
- After a migration, fixes move forward only. Down migrations and code rollback guarantees are out of scope. Before an irreversible migration, operators must have a verified backup; recovery is restore-from-backup or client-peer re-sync.

### Ordered implementation ticket graph

1. **Decision and workspace cutover** — owner: sync maintainer. Add the new ADR set, complete the package/imports and workspace cutover, update stale pure-P2P research links, and remove obsolete server-cursor DTOs. Focused gates: package build/typecheck/lint, existing direct-P2P tests, and a clean search showing no production imports of the removed package name.
2. **Shared sync contract** — owner: sync package. Freeze `/memorilo/sync/1` envelopes, strict codec, session state machine, frontiers/generation, idempotent acknowledgements, relay online-only semantics and typed errors. This is an atomic cutover with direct-P2P consumers; no old/new model coexistence. Gates: pure and scripted session suites, malformed/duplicate/reorder tests, and memory-peer tests.
3. **Canonical schema and repository ports** — owner: sync package. Define Drizzle canonical schema and projections/migrations for SQLite/PostgreSQL plus tenant-context `MetadataRepository` and `ObjectStore` ports, reset jobs and manifest/object ordering invariants. Gate: SQLite/filesystem conformance and migration/restart tests.
4. **Server runtime and local adapters** — owner: sync-server runtime. Implement configuration parsing, startup/shutdown Effect scopes, automatic migration, SQLite/filesystem adapters, health/diagnostics, and default `127.0.0.1:6000` listener. Gate: memory-peer + local adapter integration, graceful drain, config failure and restart tests.
5. **Hono identity, registration and management web** — owner: server web. Implement browser sessions/CSRF, disabled/invite/public registration, and a localhost-only first-run setup wizard that creates the initial account when registration is disabled. Then bind the selected A Operations console to the API: persistent navigation, overview, devices, policy, server data and account flows. Gate: Hono `app.request()` suite plus browser Playwright for setup, login, pairing, policy, relay warning, revoke and typed clear confirmation.
6. **Server peer and desktop integration** — owner: sync transport + desktop boundaries. Add the configurable WebSocket libp2p peer while preserving direct TCP/mDNS P2P, expose server URL/status/policy through main → preload → renderer, and complete dual-confirmation pairing. Gate: real WebSocket/front-door integration and focused packaged Electron E2E proving direct P2P alone, concurrent direct P2P + server, no duplicate effects, restart/reconnect, relay warning and authoritative reset choice.
7. **Independent production adapters** — owner: sync-server infrastructure. Add PostgreSQL and S3-compatible adapters under `infrastructure/`, each implementing the same ports without cross-imports. Run adapter contracts independently; run representative workflow combinations to verify object/metadata ordering, orphan reconciliation and reset behavior. Gate: pinned PostgreSQL/SeaweedFS service lane, Toxiproxy failure cases, permissions and restart.
8. **Destructive operations and operational hardening** — owner: server runtime/operations. Finish reset/delete generation jobs, quotas/rate limits, audit and protected metrics, one-public-port reverse-proxy deployment, crash/SIGKILL recovery, backup/restore documentation and maintenance/read-only behavior. Gate: full Issue 10 acceptance matrix, security isolation, scheduled failure/load lane and deployment smoke.

Each ticket must declare its public interface, dependency tickets, deletion/refactor scope, focused command, invariant assertions and retained diagnostics. A ticket cannot merge on a retry-only pass. Phase 8 is the only point at which the server may be declared deployable.

### ADR and documentation treatment

- Narrow ADR 0007 rather than discard it: its direct-P2P merge model, device vectors, membership epochs, Noise/Yamux and domain separation remain authoritative; its absolute ban on a server/relay/coordinator is superseded.
- Keep ADRs 0001–0006 (with ADR 0004's old server cursor remaining historical and already superseded by ADR 0007). Do not revive `last_server_sequence`.
- Before implementation, add ADRs for: optional Sync Server coexistence and `/memorilo/sync/1` topology; multi-tenant identity/authentication/pairing; Relay vs Authoritative and reset semantics; canonical Drizzle/object-store consistency; and Node/Hono/libp2p deployment/lifecycle. Keep Issue 10 as the operational verification document rather than another ADR.
- Mark `docs/research/libp2p-p2p-sync.md` as historical or add a supersession pointer, and update runtime claims in `docs/fsrs-learning-system.md` and relevant `CONTEXT.md` terminology when the protocol cutover lands.

### Recovery checkpoints

Before each phase: capture the focused test evidence and a backup/restore checkpoint for any touched persistent data. If a phase fails before migration, revert source changes. If a migration has run, do not downgrade code or schema automatically; restore the verified backup or re-pair/re-sync from authorized peers, then continue with a forward fix.
