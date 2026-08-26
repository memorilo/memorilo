# Learning Model and Interleaved Queue

Type: grilling
Status: resolved

## Question

What is Memorilo's precise domain model for a SuperMemo-style incremental learning workspace, and how does its queue interleave passive Topic processing with active recall?

Decide:

- whether the learning unit is a source Topic, a Reading Item, an existing Card/Review Target, or a new explicit Item type;
- which fields are durable (read-point, priority, provenance, processing state, next-process time, review history, and rating state);
- how Topic → extract → Item/Cloze relationships preserve source identity and survive edits;
- how incremental-reading work and FSRS review work share or separate queue ordering, daily goals, overload handling, postpone, and completion;
- what “done” means for a learning session and how route restoration identifies the active object.

The answer must use the repository glossary, identify any required new terms, and leave an implementable state machine without assuming SuperMemo's proprietary algorithm can be copied exactly.

## Answer

The Learning domain is extended with an explicit `Reading Item` while preserving the distinction between content and scheduled learning state:

- Only content explicitly added to learning becomes a `Reading Item`; an ordinary Topic is not implicitly queued.
- A `Reading Item` points to a stable Highlight inside a source Block using `sourceBlockId + highlightId`. It does not copy or create a new Block. Inline Highlight and whole-block Highlight both qualify; the Highlight action is the Extract action.
- A generated Card/Review Target remains a separate object that may reference the same source Highlight. Card generation is a later explicit action, not an automatic consequence of Highlight.
- Reading Item content follows the current source content. Edits in the Learning workspace write through to the source Topic and existing card reconciliation rules update any linked Card projection.
- If the referenced Block or Highlight is deleted, the Reading Item is deleted as a cascade. No orphan Reading Item recovery state is retained.
- Extract/provenance is represented by the stable source Block and Highlight identities; no duplicate content snapshot is required for the initial model.

Queue and state rules:

- Reading Items and existing Review Targets participate in one Learn queue, but retain separate state machines and completion actions.
- FSRS remains responsible for Review Target scheduling. Reading Items use independent `nextProcessAt`, `priority`, processing state, and read/progress metadata; the proprietary SM-17 formula is not copied.
- Due or overdue Review Targets have hard priority. Reading Items compete once processable, ordered by priority and overdue amount with a fair interleave rule so neither class can starve the other.
- Creating a Card does not complete its Reading Item. A Reading Item is completed for the current pass only through an explicit action that writes its next processing time/state. Leaving the page, navigating the Note Structure sidebar, or closing the window does not auto-complete it.
- Edits flush immediately to the source Topic. If the user leaves before the explicit completion action, the edit is retained but the Reading Item's processing state and schedule remain unchanged.
- The Learn route keeps global/current-Note scope. The active queue entry is restorable by stable kind and id; a deleted entry is skipped with a recoverable status before selecting the next entry.

This decision materially conflicts with [ADR 0006](../../../docs/adr/0006-card-topics-own-learning-cards.md), which currently says every Highlight creates a CardTopic. The implementation plan must supersede or amend that ADR before changing projection code. This is a major refactor boundary, not a local UI change: migration work must cover Highlight/CardTopic projection, Reading Item persistence and cascade deletion, editor write-through, queue selection, route restoration, and focused unit/component/integration tests for inline and whole-block Highlight edits, deletion, card generation, and interrupted processing.
