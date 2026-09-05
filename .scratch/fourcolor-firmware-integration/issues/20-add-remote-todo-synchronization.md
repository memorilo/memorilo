# Add remote TODO synchronization

Status: ready-for-human
Blocked by: device-todo-sync 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13

## Goal

Integrate the NOTE4C read-only TODO projection with timely MQTT notifications and authoritative HTTPS snapshots while preserving local HTTP management and the paginated, non-action TODO UI.

## Decision

- The server publishes a device-scoped MQTT update hint when the canonical projection changes.
- Memorilo pushes local changes directly to the device over authenticated LAN HTTP; the device never opens a LAN connection to the client because desktop firewall rules may reject inbound connections.
- NOTE4C subscribes while Wi-Fi is online, then fetches the authoritative snapshot over HTTPS. Periodic HTTPS polling remains the fallback.
- NOTE4C keeps the last valid snapshot offline and exposes it through an authenticated, read-only LAN HTTP export that the client reads by initiating the request.
- The device never completes, reopens, edits, deletes, or reorders TODO items, and it has no row-selection or task-action protocol.
- Identical/older revisions and `304 Not Modified` responses do not trigger a display refresh. New data is coalesced behind the current e-paper operation and never blocks input or turns on the front light.

The implementation tickets are maintained under `.scratch/device-todo-sync/issues/`.
