# Keep personal learning history as Anki-style synchronized events

Status: superseded for transport and cursor semantics by ADR 0007

Implementation status (2026-08-16): local Review Events, device sequencing, sync outbox, server-sequence acknowledgement and purge tombstones are implemented. Remote transport, inbound merge, clock validation, full-sync recovery and device/prune-watermark coordination are not. ADR 0007 supersedes this ADR's server-oriented cursor and transport assumptions: the adopted target is pure P2P with device version vectors and membership epochs. The remainder of this ADR records the retained event and conflict semantics rather than claiming that cross-device learning sync is currently available.

The old server acknowledgement rule is retained only as migration history. In the pure P2P protocol, a peer acknowledgement may contain no mutation IDs when it only advances one or more device-vector components; the client advances those components only after durable receipt and retains every mutation not covered by the acknowledged vector.

Memorilo keeps personal Review Events outside the collaborative Note LoroDoc and will synchronize them across the same user's devices. Normal sync will incrementally merge immutable events and rebuildable Learning State; concurrent offline ratings from the same base will all be retained as branches, while scheduling follows the canonical branch produced by the most recently performed rating. Schema-version changes or failed sanity checks will require an explicit one-way full sync.

Unlike Anki's local revlog deletion during Undo, Memorilo appends an Undo Event because the product must retain an auditable history and eventually synchronize Undo across devices. Optimizer revisions and Note assignments will sync as account-scoped metadata, while Note content and media remain separate synchronization channels.

The target protocol adds event replay, tombstones, clock checks, device-vector exchange and membership-epoch prune coordination, preventing last-upload-wins data loss and keeping parameter changes, Reset, Undo and permanent maintenance deterministic. The pure P2P transport and membership decision is documented in [ADR 0007](0007-pure-p2p-learning-sync.md); the full data and transaction design is documented in [FSRS Learning System Design](../fsrs-learning-system.md).
