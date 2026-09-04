# Add remote TODO synchronization

Status: ready-for-human
Blocked by: 06, 08, 13

## Goal

Connect the device TODO snapshot to Memorilo without making the display, BLE, or local HTTP layers authoritative for synchronization.

## Missing decisions

- Server/P2P transport and authentication scope, which was previously deferred.
- Mapping between the device's bounded TODO view and Memorilo's richer TODO hierarchy, recurrence, dates, and conflict model.
- Projection selection, refresh cadence, retry, and stale-data presentation.

## Required acceptance direction

- Synchronization enters through a typed Rust repository/service boundary.
- The last synchronized projection remains readable offline; page navigation does not mutate TODO data.
- Network retries are bounded, cancellable, power-aware, and independent of display completion.

## Decision

Keep Memorilo's sync server authoritative for both the rich TODO graph and every
TODO mutation while the device owns only a bounded read-only projection. The transport is
an authenticated HTTPS JSON endpoint in the first phase (P2P can be added
behind the same repository trait); the device sends a base revision plus
idempotency token and receives a complete projection or a typed conflict.
The device caches the most recent complete projection for offline display but
never queues completion, reopen, reorder, or deletion operations. Sync failures
never block page navigation or display refresh: stale content remains visible
with sync status until a later bounded retry succeeds. Human approval is still
required for endpoint deployment, tenant/auth mapping, hierarchy/recurrence
projection, and refresh policy.
