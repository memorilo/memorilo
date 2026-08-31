# Storage Portability and Transaction Research

Type: research
Status: resolved

## Question

Which shared repository and object-store semantics can be implemented reliably across SQLite and PostgreSQL, and across filesystem and S3-compatible storage, for multi-tenant authoritative synchronization?

Establish repository and primary-source facts for:

- existing database-driver abstractions, migrations, transaction capabilities, native dependency constraints, and reusable validation/hash code;
- cross-backend transaction and concurrency differences that affect idempotent changes, per-account serialization, snapshots, reset generations, deletion jobs, tombstones, asset manifests, and garbage collection;
- filesystem versus S3 atomicity, conditional writes, multipart uploads, object deletion, key layout, and orphan cleanup;
- a repository conformance-test approach that can run the same behavioral suite against all four configured adapters;
- Effect service/Layer boundaries for databases, object stores, migrations, and scoped shutdown.

Write the findings to `../research/storage-portability.md`, cite primary sources and local public APIs, append the asset link under `## Answer`, and mark this ticket resolved.

## Answer

[Storage Portability and Transaction Research](../research/storage-portability.md)
