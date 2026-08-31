# Storage Portability and Transaction Research

## Decision summary

Implement a new sync-server storage module rather than adapting `@memorilo/editor-storage`. Expose two domain-level ports:

- `SyncRepository`, implemented separately for SQLite and PostgreSQL;
- `ObjectStore`, implemented separately for a local filesystem and the S3-compatible API used by S3/R2.

Configuration selects exactly one implementation of each port at startup. The supported matrix is:

| Database | Objects | Supported deployment boundary |
| --- | --- | --- |
| SQLite | filesystem | One server host; preferred self-hosted default |
| SQLite | S3/R2 | One server host/process group sharing the local database |
| PostgreSQL | filesystem | One application host with local storage, unless the operator supplies a filesystem with explicitly supported shared semantics |
| PostgreSQL | S3/R2 | Multi-instance deployment |

The ports should promise the same domain behavior, not identical SQL or identical concurrency. SQLite may serialize all writers even though the contract only asks for per-account serialization. PostgreSQL may execute independent accounts concurrently. Filesystem and S3/R2 differ internally, but both can expose immutable, content-addressed objects.

Do not describe a SQLite database on a network volume as a multi-host deployment. SQLite permits only one writer at a time, and its WAL implementation requires all processes to be on the same host and explicitly does not work over a network filesystem ([SQLite isolation](https://www.sqlite.org/isolation.html), [SQLite WAL disadvantages](https://www.sqlite.org/wal.html#disadvantages)).

## What the repository already provides

### Database boundary

[`EditorStorageDatabase`](../../../packages/editor-storage/src/database-driver.ts#L11) is deliberately a SQLite adapter requiring FTS5 and sqlite-vec. Its reusable guarantee is narrow: command order and atomic `batch`. It has no interactive transaction callback, transaction-scoped connection, result-bearing mutation, isolation selection, or account lock. Those omissions prevent a safe read-modify-write server repository.

[`BetterSqliteDatabase`](../../../apps/desktop/main/src/storage/better-sqlite-database.ts#L22) provides the only production database adapter. It:

- opens `better-sqlite3`, a native Node add-on;
- optionally loads sqlite-vec;
- switches to WAL mode;
- implements `batch` with one `better-sqlite3` transaction;
- closes one owned connection.

The workspace has no PostgreSQL driver or S3 SDK dependency. `better-sqlite3` appears in the workspace's native dependency policy, while the Electron build has its own native rebuild requirement. A Node sync-server can reuse the library choice, but not the Electron adapter or its sqlite-vec requirement.

The current desktop schema is not portable SQL. It contains SQLite `PRAGMA`s, `BLOB`, `INTEGER PRIMARY KEY AUTOINCREMENT`, `GLOB`, SQLite time expressions, FTS5 virtual tables, and SQLite trigger bodies; repositories use `?` parameters throughout ([schema](../../../packages/editor-storage/src/editor-storage-schema.ts#L12)). PostgreSQL uses different parameter binding and data types. A shared raw-SQL facade would either leak dialect checks everywhere or falsely narrow capabilities.

The existing main-database generation handler deletes and recreates an unexpected non-empty database ([`openCurrentMainDatabase`](../../../apps/desktop/main/src/storage/main-database.ts#L48)). That policy is unacceptable for a multi-tenant server. Server migrations must be append-only, recorded, locked, and refuse unknown newer schema versions.

### Validation, hashing, and asset recovery

Useful code exists, but most of it is private to `@memorilo/editor-storage`:

- Note updates use SHA-256 from `@noble/hashes` for idempotency ([`updateHash`](../../../packages/editor-storage/src/editor-note-updates.ts#L37)).
- Text projections use the same library for content hashes ([`contentHash`](../../../packages/editor-storage/src/editor-storage-validation.ts#L309)).
- Asset filenames are validated before being interpolated into paths ([`validateAssetFileName`](../../../packages/editor-storage/src/editor-asset-repository.ts#L11)).
- `@memorilo/reading-model` publicly exports SHA-256 syntax validation for book identities, but not general byte hashing.

The editor-storage package's public index does not export the general hash or asset-name helpers. The sync server must not deep-import them. Extract generic SHA-256/key validation into a small public package only if both owners use exactly the same semantic contract; otherwise keep server validation in the new server-storage package.

The desktop asset workflow already demonstrates the right recovery shape: write a temporary file with exclusive creation, rename it into place, register metadata, and clean up on failure ([asset persistence](../../../apps/desktop/main/src/ipc/asset-service.ts#L190)); deletion is claimed in the database, performed in the filesystem, then completed in the database ([asset reclaim](../../../apps/desktop/main/src/ipc/asset-service.ts#L284)); startup maintenance recovers interrupted claims ([asset maintenance](../../../apps/desktop/main/src/assets/asset-maintenance.ts#L86)). The server should retain this choreography while making it tenant-aware, durable across replicas, and independent of Electron.

## Shared repository semantics

### Transaction contract

The repository port should expose domain operations, not arbitrary SQL. Internally, both database implementations need a transaction-scoped handle. The minimum primitive is equivalent to:

```ts
withAccountWrite(accountId, expectedGeneration, operation)
```

It must:

1. begin a transaction;
2. lock/serialize the account state;
3. reject a stale `expectedGeneration` before any write;
4. execute all repository mutations on the same transaction handle;
5. commit or roll back as one unit;
6. never perform object-store I/O while holding the transaction.

SQLite implements this with `BEGIN IMMEDIATE`. SQLite transactions are serializable by serializing writes, but there can be only one writer. `BEGIN IMMEDIATE` acquires the write transaction up front and can fail with `SQLITE_BUSY`; an ordinary deferred read upgraded after another writer commits can fail with `SQLITE_BUSY_SNAPSHOT` ([SQLite isolation](https://www.sqlite.org/isolation.html), [SQLite transaction modes](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions)). Configure a bounded busy timeout, keep transactions short, and retry the whole idempotent operation outside the transaction.

PostgreSQL can use its default Read Committed isolation plus `SELECT ... FOR UPDATE` on the account-state row. PostgreSQL documents that an updater waits for the concurrent updater and then re-evaluates the row condition ([Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)). A transaction-level advisory lock is an alternative before an account row exists; it is automatically released at transaction end, but its meaning is application-enforced and its key mapping must be collision-safe ([advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)). Prefer a real account row lock after account creation.

Serializable PostgreSQL transactions are also valid, but they require retrying complete transactions on SQLSTATE `40001`. They are not required if every account mutation first locks the same account row and all invariants are account-local ([PostgreSQL Serializable](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-SERIALIZABLE)). Deadlock/serialization retry remains necessary for migrations or cross-account administration.

### Idempotent changes and ordering

Use a unique logical identity, not an auto-generated database identifier, as the idempotency key:

```text
UNIQUE(account_id, generation, domain, change_id)
```

An append operation includes `payload_hash`. Its exact behavior is:

- absent key: allocate the next account/generation sequence and insert;
- existing key with the same hash: return the original receipt without writing;
- existing key with a different hash: return a typed idempotency-conflict error.

Both SQLite and PostgreSQL support `INSERT ... ON CONFLICT`; PostgreSQL guarantees an atomic insert-or-update outcome, and SQLite's UPSERT follows PostgreSQL syntax ([PostgreSQL `ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT), [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)). The hash comparison and receipt lookup must still occur under the account transaction, because `DO NOTHING` alone cannot distinguish a valid retry from identifier reuse with different bytes.

Store the next sequence/high-water mark on the locked account-generation row. Do not rely on a global database sequence: it makes per-account ordering harder to test, leaks cross-tenant activity, and cannot provide a contiguous per-account receipt after a failed transaction.

### Reset generations

Reset is a logical cutover, not an immediate tree of physical deletes:

1. lock the account state;
2. compare the expected generation;
3. increment generation and create its empty state;
4. mark the previous generation `deleting`;
5. revoke or invalidate old sync cursors as required by the pairing policy;
6. enqueue durable database and object deletion jobs;
7. commit, making the reset immediately visible.

Every write, snapshot, manifest, cursor, tombstone, and job carries `(account_id, generation)`. A stale client receives `generation-mismatch`; it cannot repopulate the cleared generation. Physical deletion runs after commit in bounded batches. Retry is safe because database deletes and object deletes are idempotent.

Credentials/account metadata and user content should live in different tables and key prefixes so the reset decision can retain the account and pairing audit records while clearing authoritative content. The final policy for retained audit records belongs to the security/data-lifecycle decision ticket.

### Snapshots, tombstones, and jobs

- A snapshot records a generation and high-water sequence. Build bytes outside the write transaction, put the immutable object, then insert the manifest under the account transaction. A failed manifest insert leaves an orphan, never a dangling database reference caused by normal workflow.
- Tombstones are generation-scoped. Keep them until every active device cursor has acknowledged the relevant high-water mark or a separately decided retention rule allows expiry. Do not derive safe deletion from wall-clock age alone.
- Background work uses durable lease rows with `claimed_by`, `claimed_until`, attempt count, and stable job identity. Claim with one conditional update. PostgreSQL may optimize multiple workers with `FOR UPDATE SKIP LOCKED`; PostgreSQL explicitly says this gives an inconsistent view suitable for queue-like tables, not general reads ([locking clause](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)). SQLite can claim under its single write transaction. Lease expiry provides the shared recovery behavior.
- Database migrations have a dedicated lock. SQLite uses `BEGIN IMMEDIATE`; PostgreSQL uses an advisory transaction lock or a locked singleton migration row. Each migration has an immutable id and checksum in `schema_migrations`. Startup refuses a checksum change, a gap, or a schema newer than the binary.

Avoid backend-specific logic in the domain contract: database timestamps, trigger-maintained asset state, `SKIP LOCKED`, PostgreSQL advisory locks, SQLite `PRAGMA`s, and bulk-copy APIs stay inside adapters. Inject a clock and store UTC epoch milliseconds consistently. Use explicit repository commands for invariants that the existing SQLite schema currently encodes in triggers.

## Object-store semantics

### The portable port

Expose a deliberately small port:

```text
putImmutable(key, bytes/stream, expectedSha256, byteLength)
get(key, optionalRange)
head(key)
delete(key)                  // absent is success
list(prefix, cursor, limit) // maintenance only
```

Multipart upload is an adapter implementation detail of `putImmutable`; callers should not receive upload IDs. Return a stable content hash and byte length, not an ETag. Amazon S3 states that a completed multipart object's ETag is not necessarily an MD5 hash ([multipart completion](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)).

Use immutable, tenant-local, generation-local content-addressed keys such as:

```text
tenants/<account-uuid>/generations/<generation>/objects/<sha256-prefix>/<sha256>
```

Account identifiers and hashes must be parsed into canonical values before constructing a key. The filesystem adapter resolves the path and verifies it remains beneath its configured root. Tenant-local content addressing avoids cross-tenant existence disclosure and makes an authoritative reset prefix enumerable without treating object listing as the primary manifest.

### Filesystem adapter

Write to a unique temporary file in the final file's directory, hash while streaming, verify length/hash, flush and close it, then rename it into place. Node exposes exclusive-create flags and `FileHandle.sync()` ([Node filesystem API](https://nodejs.org/api/fs.html#file-system-flags), [Node `FileHandle.sync`](https://nodejs.org/api/fs.html#filehandlesync)). Same-directory rename is the publication boundary; rename alone is not a promise of power-loss durability, so flush the file first and, where supported, sync the containing directory after rename.

Serialize same-key publication within the process. A cross-process race is harmless only because the final key is derived from the verified SHA-256 and both writers must contain identical bytes. If a final object exists, verify stored size/hash before accepting it as an idempotent success; a mismatch is corruption and must never be overwritten silently.

The supported filesystem mode is local storage controlled by one application host. Network filesystems, multiple independent hosts, and object-like mounted filesystems require a separate compatibility decision and are not implied by this adapter.

### S3/R2 adapter

Amazon S3 provides strong read-after-write consistency for object PUT/overwrite and DELETE, and subsequent GET/LIST observes a successful PUT ([S3 consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel)). R2 documents strong global consistency for writes, deletes, metadata, and list operations ([R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)). These guarantees allow immediate verification but do not create a transaction with the relational database.

Publish immutable keys with `If-None-Match: *` where the endpoint supports it. S3 supports this on `PutObject` and `CompleteMultipartUpload`; an existing key fails the conditional write ([S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)). R2 explicitly lists conditional `PutObject`, and its Workers API also supports conditional puts ([R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations)). Multipart conditional completion must be a capability checked by the real-endpoint conformance suite; correctness still rests on the content-addressed key and verified bytes, not on a conditional header that every S3-compatible endpoint may not implement. Treat a precondition failure as idempotent only after `HEAD` verifies the expected metadata/size; hash metadata is controlled by this application and should be checked when present.

For multipart uploads, complete is the publication boundary. Always abort on interruption/failure and run a periodic stale-upload aborter. S3 bills uploaded parts until completion or abort and recommends a lifecycle rule to abort incomplete uploads ([S3 multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [abort incomplete multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/abort-mpu.html)). R2 documents that its Workers API automatically aborts unfinished multipart uploads after seven days, but the adapter should still abort promptly and must not depend on that R2-only behavior ([R2 multipart API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2multipartupload-definition)).

Do not require conditional delete in the shared port: S3-compatible services differ. The database deletion claim/lease establishes intent; `delete` is idempotent, and completion is recorded only after it succeeds. R2 accepts up to 1,000 keys in one Workers API delete, and both S3-compatible list APIs paginate, so every sweep must be cursor-based and bounded ([R2 bucket methods](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#bucket-method-definitions)).

### Database/object consistency and garbage collection

There is no distributed transaction across either relational database and either object store. Use a recoverable state machine:

| Transition | Ordering | Recoverable residue |
| --- | --- | --- |
| create object | put immutable object, then commit manifest | orphan object if DB commit fails |
| add reference | commit manifest/reference in one DB transaction | none if manifest already ready |
| remove final reference | mark unreferenced/eligible in DB | retained object |
| reclaim | lease DB manifest, delete object, mark manifest deleted | expired lease or missing object |
| reset | switch generation and enqueue jobs in DB, then sweep objects | old generation remains inaccessible while deletion retries |

The database manifest is authoritative. Object listing is only a repair/GC input. An orphan sweeper lists the managed prefix, compares it with manifests, and deletes only after a safety window longer than the maximum upload/workflow duration. An integrity scanner travels the other direction, checking manifests with `HEAD` and reporting missing or corrupt objects. Never delete an unrecognized object immediately during a concurrent upload.

## Effect service and lifecycle shape

Follow the repository's Effect boundary rules:

- `SyncRepository`, `ObjectStore`, `MigrationRunner`, `Clock`, and configuration are small `Context` services.
- Provide `SqliteSyncRepositoryLive`, `PostgresSyncRepositoryLive`, `FilesystemObjectStoreLive`, and `S3ObjectStoreLive` as `Layer`s. Configuration composes one database layer and one object layer at the application composition root.
- Database connections/pools and object clients are scoped resources. Acquire with a scoped `Layer`/`Effect.acquireRelease`; close pools, SQLite handles, active upload scopes, and workers on interruption and shutdown.
- Run migrations after resource acquisition but before Hono or libp2p listeners become ready. On startup failure, release in reverse dependency order.
- Repository methods return typed errors such as `GenerationMismatch`, `IdempotencyConflict`, `StorageUnavailable`, `ObjectCorrupt`, and `MigrationRejected`. Convert driver exceptions only at the adapter boundary and preserve causes.
- Apply bounded retry outside the complete transaction/workflow. Retry only classified transient errors (`SQLITE_BUSY`, PostgreSQL serialization/deadlock, throttling/temporary network failures); idempotency keys and immutable object keys make the retry safe.
- Call `Effect.runPromise` only at Hono handlers, libp2p session handlers, worker loops, and the process startup/shutdown boundary.

The repo's [`createResourceScope`](../../../packages/effect-lifecycle/src/resource-scope.ts#L72) already proves cancellation-aware acquisition, rollback, reverse-order finalization, and retryable shutdown, while [`createJsonFileConfigurationAdapter`](../../../packages/config/src/json-file-adapter.ts#L35) demonstrates `Effect.acquireUseRelease` with a keyed semaphore. A new server service should use public `@memorilo/effect-lifecycle` helpers where their Promise-shaped contract fits, and native scoped Layers for services that stay inside Effect. It should not construct a database or S3 client inside repository methods.

## Conformance and failure testing

No production adapter should be considered complete from unit mocks alone. Build reusable Vitest suites around fixture factories, with each factory yielding an Effect-scoped adapter and isolated namespace.

### Repository contract suite

Run the same behavioral suite against:

- SQLite in a temporary on-disk database with at least two connections; do not use only `:memory:` because it hides WAL, busy, reopen, and crash behavior;
- a real temporary PostgreSQL database/schema, with at least two pooled connections.

Required cases:

- identical concurrent change IDs produce one row and the same receipt;
- same change ID with different hashes is rejected;
- concurrent appends within one account receive unique ordered sequences;
- independent accounts never read or mutate one another;
- stale writers fail after reset and cannot recreate the old generation;
- reset becomes logically empty before deletion jobs finish;
- snapshot high-water marks never include a partially committed append;
- tombstone retention respects active device cursors;
- two job workers never own the same live lease, and expired leases recover after process loss;
- migration from empty, each supported prior version, concurrent startup, injected failure/rollback, checksum mismatch, and unknown newer version;
- shutdown waits for admitted operations and rejects new work.

Use deterministic barriers inside adapter test hooks to force interleavings; timing-only concurrency tests are insufficient. For SQLite, assert bounded `SQLITE_BUSY` retry and reopen the file after failure. For PostgreSQL, include transaction cancellation and deadlock/serialization retry classification.

### Object-store contract suite

Run the same suite against:

- a fresh temporary filesystem directory;
- the S3 adapter pointed at an isolated bucket prefix. An S3-compatible local service is useful in pull requests, but periodic/CI jobs must also run against actual Amazon S3 and Cloudflare R2 because compatibility differences are part of the supported surface.

Required cases:

- put/get/head round trip and range reads;
- idempotent repeated and concurrent puts of the same content-addressed key;
- existing-key size/hash mismatch reports corruption;
- truncated input and declared hash/length mismatch never publish an object;
- interruption at every multipart stage aborts or is found by stale-upload cleanup;
- delete is idempotent;
- list pagination works beyond 1,000 keys without omissions or duplicates;
- traversal and non-canonical tenant/generation/hash keys are rejected;
- restart recovers filesystem temp files without publishing them;
- cancellation closes streams and releases file descriptors/upload resources.

### Full 2 x 2 workflow matrix

Run the authoritative asset/snapshot workflow suite across all configured pairs: SQLite/filesystem, SQLite/S3, PostgreSQL/filesystem, and PostgreSQL/S3. Inject failure after every boundary:

- object put before manifest commit;
- manifest transaction rollback after a successful put;
- deletion claim before object delete;
- object delete before DB completion;
- reset commit before any physical deletion;
- process termination while a job lease is held.

After restart/reconciliation, assert the invariant: a ready manifest resolves to the expected bytes; no old-generation data is reachable through current-generation APIs; and every other residue is either a durable retryable job or a grace-period orphan eligible for GC.

Use child-process crash tests for SQLite/filesystem durability rather than exceptions alone. Keep cloud credentials out of the default local command; expose explicit S3 and R2 conformance jobs using isolated prefixes and guaranteed teardown. The same tests should receive backend factories, never branch on backend names except for separately labelled capability tests such as PostgreSQL parallelism or S3 multipart behavior.

## Implementation consequences

1. Create a new storage package with domain repositories and backend-neutral test contracts. Do not place the server schema in `@memorilo/editor-storage`.
2. Maintain backend-specific migration/SQL modules behind the package public API. Sharing schema concepts is required; sharing SQL strings is not.
3. Make all content rows, object manifests, cursors, tombstones, and jobs tenant- and generation-scoped.
4. Use database-backed account serialization and durable job leases. Never rely on a process-local mutex for correctness in PostgreSQL/S3 deployments.
5. Treat object storage as immutable and content-addressed, with the relational manifest as source of truth.
6. Ship all four adapters behind startup configuration, but validate unsupported deployment combinations such as multi-instance SQLite or per-host filesystem storage at startup/documentation boundaries.
7. Add the two per-port conformance suites and the 2 x 2 fault-injection workflow matrix as implementation acceptance criteria.

## Primary sources

- Local public APIs and implementations: [`database-driver.ts`](../../../packages/editor-storage/src/database-driver.ts), [`better-sqlite-database.ts`](../../../apps/desktop/main/src/storage/better-sqlite-database.ts), [`editor-storage-schema.ts`](../../../packages/editor-storage/src/editor-storage-schema.ts), [`editor-asset-repository.ts`](../../../packages/editor-storage/src/editor-asset-repository.ts), [`asset-service.ts`](../../../apps/desktop/main/src/ipc/asset-service.ts), [`asset-maintenance.ts`](../../../apps/desktop/main/src/assets/asset-maintenance.ts), [`resource-scope.ts`](../../../packages/effect-lifecycle/src/resource-scope.ts).
- SQLite: [Isolation](https://www.sqlite.org/isolation.html), [Transactions](https://www.sqlite.org/lang_transaction.html), [WAL](https://www.sqlite.org/wal.html), [UPSERT](https://www.sqlite.org/lang_upsert.html).
- PostgreSQL: [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [Explicit/advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html), [`SELECT` locking clauses](https://www.postgresql.org/docs/current/sql-select.html), [`INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html).
- Amazon S3: [Consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel), [Conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [Multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [Aborting multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/abort-mpu.html).
- Cloudflare R2: [Consistency](https://developers.cloudflare.com/r2/reference/consistency/), [Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
- Node.js: [File system API](https://nodejs.org/api/fs.html).
