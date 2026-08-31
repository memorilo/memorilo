# Sync Server Implementation and Verification Plan

Label: wayfinder:map

## Destination

Produce a decision-complete, execution-ready specification for `apps/sync-server`: its Node/Hono architecture, libp2p protocol, multi-tenant domain model, authentication and pairing, storage adapters, management web UI, destructive migration sequence, and executable automated-test strategy.

This map does not implement the server. It is complete when implementation work can be split into ordered tickets with explicit interfaces, invariants, failure behavior, verification commands, and acceptance criteria.

## Notes

Domain: optional multi-tenant synchronization infrastructure that coexists with Memorilo's existing direct Paired Device P2P synchronization.

Consult `codebase-design` for module and service boundaries, `domain-modeling` for durable sync terminology and ADR-worthy decisions, `grilling` for product/security decisions, `research` for external and repository facts, and `prototype` when a management workflow needs concrete human review. Follow the repository's Effect-TS rules for asynchronous orchestration, external effects, cancellation, retries, and resource lifetimes.

Standing decisions:

- Target Node.js only; Cloudflare Workers, D1, Durable Objects, and R2 are not deployment targets.
- Use Hono without TanStack Start or Next.js. The management web uses React/Vite, limited non-streaming Hono React SSR with hydration, and public `@memorilo/ui` components, defaulting to `neubrutalism`.
- Preserve direct TCP/mDNS P2P while adding the Sync Server as an optional WebSocket libp2p peer.
- Include Note, Personal Learning Sync, and asset synchronization.
- Relay Sync Mode persists no transferred payload and cannot provide offline recovery; the product must state this explicitly.
- Authoritative Sync Mode stores plaintext and lets an authorized user clear their server-held data.
- Require one externally visible HTTPS/WSS port; internal listeners may be separated behind path/upgrade routing.
- Implement configurable SQLite and PostgreSQL repositories plus filesystem and S3-compatible object stores.
- Support disabled registration, invite registration, and public registration as server configuration modes.
- Breaking schema, protocol, pairing, and local-data changes are permitted; do not add a compatibility layer unless a later ticket chooses a narrow migration path for a proven requirement.

Prior feasibility research: [sync-server architecture research](../sync-server-research/spec.md).

## Decisions so far

- [Protocol and Node Composition Research](issues/01-protocol-and-node-composition-research.md): Extract a strict transport-neutral `/memorilo/sync/1`; keep direct P2P and add a configured WebSocket server route, with public `:443` split by a reverse proxy into Hono and libp2p listeners.
- [Storage Portability and Transaction Research](issues/02-storage-portability-research.md): Use domain-level `SyncRepository` and `ObjectStore` ports with separate SQLite/PostgreSQL and filesystem/S3 adapters, account-generation serialization, immutable content-addressed objects, and shared conformance suites.
- [Verification Harness and Failure Injection Research](issues/03-verification-harness-research.md): Layer pure/session, memory-peer, real WebSocket, adapter conformance, browser, desktop-boundary, and focused Electron E2E suites; use pinned PostgreSQL/SeaweedFS/Toxiproxy process fixtures and deterministic barriers.
- [Server Domain and Tenancy Model](issues/04-server-domain-and-tenancy-model.md): Make Account a single-user tenant, bind Account Devices to DeviceId/PeerId/credential/epoch, allow one active server account per local database, and prohibit cross-account data or collaboration.
- [Registration, Authentication, and Pairing Contract](issues/05-registration-authentication-and-pairing-contract.md): Use configurable disabled/invite/public registration; Argon2id browser authentication with cookie sessions and CSRF protection; single-use admin invites; dual-confirmation pairing; device-generated signing keys with scoped revocable credentials bound to Account/DeviceId/PeerId/MembershipEpoch; replay/idempotency checks; step-up for destructive or policy-changing actions; and explicit no-offline-recovery messaging when authoritative data is cleared.
- [Sync Protocol and Mode Semantics](issues/06-sync-protocol-and-mode-semantics.md): Standardize transport-neutral `/memorilo/sync/1` with authenticated device/server roles, namespace frontiers, ordered bounded pull/push phases, idempotent acknowledgements, online-only non-durable relay forwarding, plaintext authoritative persistence with deterministic merge, account policy/epoch gates, explicit mode switching, reset-generation deletion jobs, content-addressed asset streams, and bounded retry/error/backpressure behavior.
- [Repository and Object Storage Contracts](issues/07-repository-and-object-storage-contracts.md): Use tenant-context domain repositories with account-generation transactions, local receipt ordering, Drizzle ORM backed by one canonical schema specification and generated SQLite/PostgreSQL projections/migrations, logical reset plus durable leased jobs, immutable tenant-local object keys, manifest-led database/object recovery and GC, validated deployment topology, and shared conformance across all four database/object combinations.
- [Node, Hono, and libp2p Resource Topology](issues/08-node-hono-libp2p-resource-topology.md): Split protocol/storage public packages from the server app; expose one public HTTPS/WSS port through a TLS proxy to separate Hono and libp2p listeners; let Hono own API, assets, and bounded React SSR while browser/libp2p auth adapters share domain services; compose strict configuration and scoped Effect Layers with explicit startup/drain; provide protected observability; and constrain multi-instance relay to sticky routing.
- [Management Web Workflows](issues/09-management-web-workflows.md): Adopt the A Operations console with persistent account navigation and an overview landing page; retain validated pairing, mode-switch, relay warning, device-revoke, storage, and typed data-clear workflows with responsive navigation.
- [Verification Strategy and Acceptance Matrix](issues/10-verification-strategy-and-acceptance-matrix.md): Use invariant-first layered suites from pure codecs through packaged Electron; require all SQLite/PostgreSQL × filesystem/S3 combinations, deterministic failpoints and real-service failures, direct-P2P/server coexistence acceptance, zero-retry event-driven tests, explicit CI lanes, and diagnostic evidence before merge.
- [Migration Sequence and Implementation Tickets](issues/11-migration-sequence-and-implementation-tickets.md): Deliver through eight deep-module phases: complete the `packages/sync` workspace cutover, atomically use `/memorilo/sync/1`, add canonical Drizzle ports and local adapters, build Node/Hono/web setup wizard and A console, integrate WebSocket peer with desktop, add independent PostgreSQL/S3 adapters, then harden reset/operations. Providers are configuration-only, migrations run at startup, and post-migration recovery is backup/peer re-sync rather than code rollback.

## Implementation readiness

Wayfinding is complete: issues 01–11 are resolved. Before production implementation starts, create the ADR/documentation updates listed in issue 11, then execute its eight ordered implementation phases. The map intentionally does not add another research card; remaining work is implementation, focused verification, and deployment acceptance.

## Out of scope

- Implementing or committing production code during wayfinding.
- Cloudflare Workers, D1, Durable Objects, and R2 adapters.
- Replacing or disabling direct Paired Device P2P synchronization.
- Reusing Electron-only renderer, preload, IPC, or desktop contextual Hono handlers as public server APIs.
- Marketing pages, public content publishing, or unrelated desktop UI redesign.
