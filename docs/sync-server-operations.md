# Sync Server operations

`apps/sync-server` is a Node-only Hono and libp2p service. One application listener serves management HTTP and proxies WebSocket Upgrade requests to the loopback-only libp2p listener. A TLS proxy may expose that listener as one public HTTPS/WSS port.

## Startup configuration

Configuration is read once during process startup. Provider or mode changes are not applied at runtime; stop the process before changing them. The defaults bind `127.0.0.1:6000`, use SQLite plus filesystem objects, allow Relay and Authoritative modes, and disable registration.

Set `MEMORILO_SYNC_SERVER_CONFIG_FILE` to a JSON file whose keys use the camel-case names in `SyncServerConfig`. Unknown keys and invalid values reject startup. Explicit `MEMORILO_SYNC_SERVER_*` variables override values from the file. For example:

```json
{
  "dataDir": "/var/lib/memorilo-sync",
  "enabledModes": ["relay", "authoritative"],
  "host": "127.0.0.1",
  "maintenanceMode": "off",
  "metadataDatabase": "sqlite",
  "objectStore": "filesystem",
  "port": 6000,
  "peerPort": 6001,
  "registration": "disabled",
  "sessionIdleTimeoutMs": 30000,
  "sessionTotalTimeoutMs": 120000,
  "trustProxy": true
}
```

| Variable | Meaning |
| --- | --- |
| `MEMORILO_SYNC_SERVER_CONFIG_FILE` | Optional JSON configuration file. Its camel-case keys are merged first; environment variables override matching keys. |
| `MEMORILO_SYNC_SERVER_DOMAIN` | Caddy deployment variable, not read by the Sync Server process. Sets the public hostname in `deploy/Caddyfile`. |
| `MEMORILO_SYNC_SERVER_DATA_DIR` | Root directory for the SQLite database, server peer identity, and default filesystem objects. Default `./data/sync-server`. |
| `MEMORILO_SYNC_SERVER_HOST` | Application listen address. Keep `127.0.0.1` when Caddy runs on the same host. |
| `MEMORILO_SYNC_SERVER_PORT` | Application HTTP/WebSocket front door. Default `6000`. |
| `MEMORILO_SYNC_SERVER_PEER_PORT` | Internal loopback libp2p listener. Default `6001`; never expose it publicly. |
| `MEMORILO_SYNC_SERVER_ENABLED_MODES` | Comma-separated `relay`, `authoritative`, or both. This is the upper bound for every account policy. |
| `MEMORILO_SYNC_SERVER_DEVICE_CREDENTIAL_TTL_MS` | Lifetime for newly issued scoped device credentials. Default 90 days; minimum one hour. |
| `MEMORILO_SYNC_SERVER_MAINTENANCE_MODE` | `off` or `read-only`. Read-only rejects sync payload writes and management mutations. |
| `MEMORILO_SYNC_SERVER_REGISTRATION` | `disabled`, `invite-only`, or `public`. An empty installation permits one initial account from any IP before this policy applies; afterward this setting controls additional registrations. |
| `MEMORILO_SYNC_SERVER_METADATA_DATABASE` | Metadata provider: `sqlite` or `postgres`. Default `sqlite`. |
| `MEMORILO_SYNC_SERVER_POSTGRES_URL` | PostgreSQL connection URL; required when `METADATA_DATABASE=postgres`. |
| `MEMORILO_SYNC_SERVER_OBJECT_STORE` | Object provider: `filesystem` or `s3`. Default `filesystem`. This is independent of the metadata provider. |
| `MEMORILO_SYNC_SERVER_FILESYSTEM_ROOT` | Filesystem object root. Defaults to `<DATA_DIR>/objects` when omitted. |
| `MEMORILO_SYNC_SERVER_S3_ACCESS_KEY_ID` | Optional S3 access key. Must be provided together with `S3_SECRET_ACCESS_KEY`; SDK credentials are used when both are omitted. |
| `MEMORILO_SYNC_SERVER_S3_SECRET_ACCESS_KEY` | Optional S3 secret key. Must be provided together with `S3_ACCESS_KEY_ID`. |
| `MEMORILO_SYNC_SERVER_S3_BUCKET` | S3 bucket; required when `OBJECT_STORE=s3`. |
| `MEMORILO_SYNC_SERVER_S3_ENDPOINT` | Optional S3-compatible endpoint URL, such as an R2, MinIO, or other compatible service endpoint. |
| `MEMORILO_SYNC_SERVER_S3_REGION` | S3 signing region. Default `us-east-1`. |
| `MEMORILO_SYNC_SERVER_S3_FORCE_PATH_STYLE` | Whether to use path-style S3 requests. Accepts boolean strings such as `true`/`false`; default `false`. |
| `MEMORILO_SYNC_SERVER_SESSION_IDLE_TIMEOUT_MS` | Maximum time without sync/object stream activity. Default 30 seconds. |
| `MEMORILO_SYNC_SERVER_SESSION_TOTAL_TIMEOUT_MS` | Maximum lifetime of one sync/object stream. Default 2 minutes and never shorter than the idle timeout. |
| `MEMORILO_SYNC_SERVER_MAX_SYNC_SESSIONS_PER_ACCOUNT` | Maximum concurrent sync sessions per account. Default `8`. |
| `MEMORILO_SYNC_SERVER_MAX_OBJECT_TRANSFERS_PER_ACCOUNT` | Maximum concurrent object transfers per account. Default `4`. |
| `MEMORILO_SYNC_SERVER_ORPHAN_GRACE_MS` | Delay before an unreferenced object is eligible for cleanup. Default 15 minutes; minimum 2 minutes. |
| `MEMORILO_SYNC_SERVER_ORPHAN_INTERVAL_MS` | Interval between orphan reconciliation passes. Default 1 minute; minimum 10 seconds. |
| `MEMORILO_SYNC_SERVER_METRICS_TOKEN` | Optional token of at least 32 characters. `/metrics` does not exist when omitted. |
| `MEMORILO_SYNC_SERVER_TRUST_PROXY` | Set to `true` only when every request reaches the app through a trusted proxy that replaces `X-Forwarded-For`. |
| `MEMORILO_SYNC_SERVER_MAX_AUTH_ATTEMPTS_PER_MINUTE` | Per-client setup, registration, and login attempt limit. Default `10`. |
| `MEMORILO_SYNC_SERVER_MAX_API_REQUESTS_PER_MINUTE` | Per-client management API limit. Default `600`. |

Transport reconnects use bounded exponential backoff (six automatic attempts by default, capped at one minute with jitter). Credential, generation, policy, mode, and protocol failures stop automatic reconnect until the paired credential or server policy fingerprint changes; only connection closure and timeout failures enter the retry schedule.

PostgreSQL, S3 credentials, data paths, orphan reconciliation, and per-account connection limits use the `MEMORILO_SYNC_SERVER_*` variables declared in `apps/sync-server/src/config.ts`. Secrets must come from the service manager's secret environment or credential facility and must not be written into the Caddyfile or logs.

Before becoming ready, the filesystem provider creates, reads, and removes a private probe file. The S3 provider checks the bucket and creates, lists, heads, and deletes a unique `.memorilo-health/` probe object. Its credentials therefore need `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` for the configured bucket; startup fails instead of advertising readiness when any required capability is unavailable.

## Account and device pairing

Create the initial account from the management page at any IP, then configure the server URL in the desktop client before starting pairing. This one-time setup remains available only while the account database is empty; after that, `registration` controls additional accounts. Protect an exposed empty deployment until setup is complete. The client accepts the invitation from the management page and produces a signed response; the management page consumes that response and displays a one-time versioned credential bundle. Paste the complete bundle into the client. It binds the secret to the server PeerId plus the account generation, membership epoch, policy epoch, and enabled modes; the desktop stores the bundle with operating-system encryption and sends only the raw secret on the sync protocol.

Legacy raw device credentials are not accepted. Revoking a device or clearing authoritative data advances account membership and requires that device to pair again. A reset error is surfaced to the desktop before the stale credential is rejected, but the server cannot recover the cleared generation while all data-bearing clients and peers are offline.

## One public port

The reference `apps/sync-server/deploy/Caddyfile` terminates TLS and forwards both HTTPS and WebSocket Upgrade traffic to port 6000. The application routes Upgrade traffic internally to port 6001. Set:

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
