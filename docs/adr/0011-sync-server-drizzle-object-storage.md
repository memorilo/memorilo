# Use one canonical Drizzle schema with independent metadata and object providers

Status: accepted

`packages/sync` owns the canonical server schema specification and repository/object-store ports. Drizzle projections and migrations target SQLite and PostgreSQL from that specification. `apps/sync-server` owns concrete implementations outside `src/`, under its infrastructure tree; adapters depend only on the shared ports and do not import one another.

Metadata database (`sqlite` or `postgres`) and object store (`filesystem` or `s3`) are independent configuration providers. The program does not switch providers at runtime, discover old providers, or migrate data between them. Provider changes are offline operator work. On startup the selected provider runs pending schema migrations automatically, then passes health, permission, root/bucket and invariant checks; mismatch or failure rejects startup.

Authoritative object writes use immutable content-addressed keys and commit metadata references only after the object is available. Reset/deletion records a generation/tombstone before cleanup; cleanup jobs are leased, restartable and idempotent. There is no cross-provider transaction or promise of code rollback after a migration.
