# Use pure P2P synchronization with device version vectors and membership epochs

Status: accepted

Memorilo will synchronize personal learning data and collaborative Note updates directly between explicitly paired Electron devices over libp2p, without a rendezvous service, relay server, bootstrap server, DHT service, or other synchronization coordinator. Every node must use Noise for authenticated encrypted connections, Yamux for stream multiplexing, and mDNS for local peer discovery; discovered peers are only candidates and never receive data without an existing pairing grant.

Pairing is a local, user-mediated discovery flow. Device A can enable discovery for five minutes in the current application process only. Raw mDNS discovery remains internal and is never shown as an available device by itself. Device B probes an mDNS peer over `/memorilo/pairing/1`; A responds with its device identity and window expiry only while discovery is enabled, after which B may show A and request pairing. A must approve the request; both devices derive and display the same five-emoji verification code. The grant is persisted only after users confirm that the emoji sequence matches on both devices. The five-minute window, advertised availability, and pending requests are memory-only and are not restored after an application restart.

Every device also has a Device Display Name, initialized from the operating-system host name and editable in Sync settings. The name is shown for the local device, available devices, pending/approved pairing requests, and Paired Devices. It is mutable metadata only: changing it must not rotate the libp2p private key or PeerId, change `deviceId`, pairing credentials, the Emoji verification sequence, or membership epoch.

The learning sync protocol replaces the server-oriented `last_server_sequence` cursor with a device version vector keyed by stable `deviceId`. Each mutation carries its originating device and strictly increasing device sequence; a peer advertises the highest contiguous sequence it has durably accepted for every device, and synchronization exchanges the missing mutations until both vectors converge. A mutation is acknowledged only after durable local persistence, and an outbox entry is retained until the paired-device set has acknowledged it or the device is removed through a newer membership epoch.

Pairing changes create a monotonically increasing membership epoch. The epoch records the authorized device set and the authorization generation used for tombstones and pruning. A removed device cannot acknowledge, publish, or cause purge progress for a later epoch; re-pairing creates a new device identity or explicit new grant. Permanent deletion uses tombstones retained until every currently authorized device has advanced past the tombstone in the relevant epoch; if a device is offline, purge remains blocked rather than silently deleting recovery information.

Note LoroDocs and personal learning data remain separate synchronization domains. Loro frontiers/version vectors determine Note deltas and snapshots, while learning mutations use the device version vector above. Both domains use bounded, length-delimited `/memorilo/sync/1` streams, update/mutation hashes, replay protection, schema negotiation, and atomic persistence before acknowledgement. Full recovery is an explicit user-visible snapshot operation and must not silently replace concurrent local data.

## Considered Options

- A centralized sequence service was rejected because the product requirement is server-free operation and local-network/offline synchronization.
- Public bootstrap, rendezvous, DHT, Circuit Relay, and DCUtR were rejected for the initial protocol because they introduce infrastructure, metadata exposure, and operational dependencies. They may be considered in a future ADR without changing the merge model.
- Gossipsub was rejected as the source of truth: it does not provide durable delivery, replay, per-mutation acknowledgement, or tombstone pruning semantics.

## Consequences

- The paired device set and membership epoch are now part of the durable sync state; deleting or resetting that state requires an explicit recovery path.
- A device that is offline or permanently lost can prevent tombstone purge until it is removed in a newer membership epoch. This is intentional data-retention behavior.
- mDNS only discovers peers on the same local network. Devices on different networks require a user-provided reachable multiaddress or a future transport/discovery ADR; the initial protocol does not promise global NAT traversal.
- Existing server-sequence fields and acknowledgements are compatibility liabilities. They must be migrated or marked legacy before implementing the pure P2P sync engine; no silent interpretation of a server cursor as a device vector is allowed.
