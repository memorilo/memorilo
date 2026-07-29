# Store each Note as one LoroDoc

Each Note is one collaborative and persistence aggregate backed by a single LoroDoc. Folder and Topic entries share a LoroTree, while every Topic owns a separate Block tree; SQLite stores the Loro update log and rebuildable NoteEntry, Topic, and Block projections. This keeps hierarchy moves and Topic edits in the same convergent history, at the cost of making the whole Note the unit of synchronization, time travel, and recovery.
