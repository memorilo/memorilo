# Sync Server operations

`apps/sync-server` is a Node-only Hono and libp2p service. One application listener serves management HTTP and libp2p WebSocket Upgrade requests on the same port. A TLS proxy may expose that listener as one public HTTPS/WSS port.

## Startup configuration

Container startup, the configuration-file example, and the complete environment-variable reference live in the [Sync Server container README](../apps/sync-server/README.md#configuration). The same configuration contract applies when the process runs outside the image, except that the image supplies container-specific host and data-directory defaults.

Transport reconnects use bounded exponential backoff (six automatic attempts by default, capped at one minute with jitter). Credential, generation, policy, mode, and protocol failures stop automatic reconnect until the paired credential or server policy fingerprint changes; only connection closure and timeout failures enter the retry schedule.

PostgreSQL, S3 credentials, data paths, orphan reconciliation, and per-account connection limits use the `MEMORILO_SYNC_SERVER_*` variables declared in `apps/sync-server/src/config.ts` and documented in the container README. Secrets must come from the service manager's secret environment or credential facility and must not be written into the Caddyfile or logs.

Before becoming ready, the filesystem provider creates, reads, and removes a private probe file. The S3 provider checks the bucket and creates, lists, heads, and deletes a unique `.memorilo-health/` probe object. Its credentials therefore need `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` for the configured bucket; startup fails instead of advertising readiness when any required capability is unavailable.

## Account and device pairing

Create the initial account from the management page at any IP, then configure the server URL in the desktop client before starting pairing. This one-time setup remains available only while the account database is empty; after that, `registration` controls additional accounts. Protect an exposed empty deployment until setup is complete. The client accepts the invitation from the management page and produces a signed response; the management page consumes that response and displays a one-time versioned credential bundle. Paste the complete bundle into the client. It binds the secret to the server PeerId plus the account generation, membership epoch, policy epoch, and enabled modes; the desktop stores the bundle with operating-system encryption and sends only the raw secret on the sync protocol.

Legacy raw device credentials are not accepted. Revoking a device or clearing authoritative data advances account membership and requires that device to pair again. A reset error is surfaced to the desktop before the stale credential is rejected, but the server cannot recover the cleared generation while all data-bearing clients and peers are offline.

## One public port

The reference `apps/sync-server/deploy/Caddyfile` terminates TLS and forwards both HTTPS and WebSocket Upgrade traffic to port 6000. Set:

```sh
MEMORILO_SYNC_SERVER_DOMAIN=sync.example.com caddy run --config apps/sync-server/deploy/Caddyfile
```

Run the sync server with `MEMORILO_SYNC_SERVER_HOST=127.0.0.1` and `MEMORILO_SYNC_SERVER_TRUST_PROXY=true`. Caddy replaces the client-address and request-id headers. Do not enable proxy trust when clients can connect directly to the application listener.

## Health and metrics

- `/livez` reports process liveness during drain.
- `/readyz` returns `503` once admission has stopped.
- `/healthz` reports non-secret provider and mode configuration.
- `/metrics` uses Prometheus text format and requires `Authorization: Bearer <MEMORILO_SYNC_SERVER_METRICS_TOKEN>`.

Browser management sessions cannot authenticate `/metrics`. Metrics tokens cannot call management APIs or sync protocols. Account security events are stored in `sync_audit_events` and exposed only to that account through the authenticated management console.

## Backup and restore

Relay payloads are never stored and therefore cannot be backed up or restored. If every data-bearing peer is offline or lost, Relay cannot recover that data.

Authoritative backup is a coordinated metadata and object-store operation. Stop the service and wait for shutdown to complete before taking a SQLite/filesystem backup. Copy both `sync.sqlite` and the complete object root from the same stopped state. Restoring only one side can leave object metadata missing bytes or unreferenced bytes awaiting reconciliation.

For PostgreSQL/S3, use a PostgreSQL snapshot or `pg_dump` together with an S3 versioned snapshot whose restore point is no older than the database snapshot. Restore objects first, restore metadata second, then start exactly one server instance and inspect `/readyz` plus reconciliation logs before admitting clients.

Always verify a backup by restoring it into an isolated stopped deployment and checking:

1. Drizzle migrations complete without a down migration.
2. Every committed object metadata row has readable bytes with the expected hash and length.
3. Account, device, generation, policy, reset-job, and audit records are present.
4. A paired client can pull authoritative Notes, Learning Sync data, and assets.

Schema migration is forward-only. After an irreversible migration, recover by restoring a verified backup or by clearing server-held data and re-syncing from an authorized peer; do not downgrade the application against a newer database.

## Maintenance and provider changes

There is no runtime provider switch or online provider migration. `maintenanceMode: "read-only"` leaves authenticated reads and authoritative pulls available, rejects incoming sync payloads and management mutations, and pauses reset/orphan deletion workers. Browser login/logout, durable security audit records, migrations and session housekeeping may still write metadata; this is an application data guard, not a filesystem or database read-only guarantee.

For a consistent provider migration or cold backup, remove the instance from the proxy, gracefully stop it, perform the operator-managed database/object copy, update startup configuration, and restart. The program only connects to and validates the selected providers.

SQLite/filesystem is single-instance. PostgreSQL/S3 may be used by multiple Authoritative instances, but Relay presence is process-local; Relay requires account-sticky routing. If sticky routing cannot be guaranteed, remove `relay` from `MEMORILO_SYNC_SERVER_ENABLED_MODES` before startup.

## Verification lanes

Run the fast SQLite/filesystem and Hono checks without external services:

```sh
pnpm --filter @memorilo/sync-server test
```

Run the production-provider matrix from the dedicated shell:

```sh
nix develop .#sync-server-test -c pnpm --filter @memorilo/sync-server test:services
```

The service lane creates isolated PostgreSQL and SeaweedFS S3 data directories, places both providers behind Toxiproxy, and runs the SQLite/S3, PostgreSQL/filesystem, and PostgreSQL/S3 combinations serially. Its network-cut cases require interrupted writes to fail, verify that no partial metadata or object was committed, re-enable the proxy, and then verify that previously durable data remains readable. The runner owns all child processes and removes its temporary directory after success, failure, `SIGINT`, or `SIGTERM`.
