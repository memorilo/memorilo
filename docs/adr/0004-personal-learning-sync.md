# Keep personal learning history as Anki-style synchronized events

Implementation status (2026-08-06): local Review Events, device sequencing, sync outbox, server-sequence acknowledgement and purge tombstones are implemented. Remote transport, inbound merge, clock validation, full-sync recovery and device/prune-watermark coordination are not. The remainder of this ADR records the adopted target protocol rather than claiming that cross-device learning sync is currently available.

Memorilo keeps personal Review Events outside the collaborative Note LoroDoc and will synchronize them across the same user's devices. Normal sync will incrementally merge immutable events and rebuildable Learning State; concurrent offline ratings from the same base will all be retained as branches, while scheduling follows the canonical branch produced by the most recently performed rating. Incompatible schema or failed sanity checks will require an explicit one-way full sync.

Unlike Anki's local revlog deletion during Undo, Memorilo appends an Undo Event because the product must retain an auditable history and eventually synchronize Undo across devices. Optimizer revisions and Note assignments will sync as account-scoped metadata, while Note content and media remain separate synchronization channels.

The target protocol adds event replay, tombstones, clock checks and prune-watermark coordination, preventing last-upload-wins data loss and keeping parameter changes, Reset, Undo and permanent maintenance deterministic. The full data and transaction design is documented in [FSRS Learning System Design](../fsrs-learning-system.md).
