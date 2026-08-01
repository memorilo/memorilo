# Keep personal learning history as Anki-style synchronized events

Memorilo keeps personal Review Events outside the collaborative Note LoroDoc and synchronizes them across the same user's devices. Normal sync incrementally merges immutable events and rebuildable Learning State; concurrent offline ratings from the same base are all retained as branches, while scheduling follows the canonical branch produced by the most recently performed rating. Incompatible schema or failed sanity checks require an explicit one-way full sync.

Unlike Anki's local revlog deletion during Undo, Memorilo appends an Undo Event because the product must retain an auditable history and synchronize Undo across devices. Optimizer revisions and Note assignments sync as account-scoped metadata, while Note content and media remain separate synchronization channels.

This adds event replay, tombstones, clock checks and prune-watermark coordination, but prevents last-upload-wins data loss and keeps parameter changes, Reset, Undo and permanent maintenance deterministic. The full data and transaction design is documented in [FSRS Learning System Design](../fsrs-learning-system.md).
