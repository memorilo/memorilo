# Verification Harness and Failure Injection Research

Type: research
Status: resolved

## Question

What automated test harnesses and failure-injection methods can verify the Sync Server end to end without weakening the existing P2P path?

Establish repository and primary-source facts for:

- current Vitest workspace, Electron E2E, libp2p, Hono, SQLite, PostgreSQL, filesystem, and S3-compatible test capabilities;
- deterministic in-process peer tests, real WebSocket integration tests, desktop-main/preload/renderer boundaries, and browser management-flow coverage;
- temporary PostgreSQL/S3-compatible services without global installation, including devShell, Nix, container, or process-based options actually available in this workspace;
- failure injection for disconnects, duplicate/reordered frames, partial persistence, object upload failure, credential revocation, policy changes, reset/deletion races, restart recovery, tenant isolation, and graceful shutdown;
- focused commands, suite ownership, runtime budget, flake controls, and which acceptance cases require Electron E2E rather than package-level integration.

Write the findings to `../research/verification-harness.md`, cite primary sources and local test infrastructure, append the asset link under `## Answer`, and mark this ticket resolved.

## Answer

[Verification Harness and Failure Injection Research](../research/verification-harness.md) establishes a layered protocol/memory/WebSocket/Electron harness, four-backend conformance suites, Nix-based PostgreSQL/SeaweedFS/Toxiproxy fixtures, deterministic failure injection, CI budgets, and an independent regression gate for the original P2P path.
