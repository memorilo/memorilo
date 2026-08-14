# Store SpreadsheetTopics as cell-native Loro data

Memorilo stores each SpreadsheetTopic's authoritative Workbook data as fine-grained Sheet, Row, Column, Cell, formula, and formatting state inside the owning Note's LoroDoc. Stable identities, rather than A1 coordinates or an opaque workbook snapshot, define Cells and FormulaReferences so concurrent edits and structural changes converge without replacing the complete Workbook.

Spreadsheet search and query data use dedicated, rebuildable SQLite projections rather than `topic_blocks`. FormulaReferences may target another SpreadsheetTopic only when both Topics belong to the same Note, keeping formula evaluation, collaboration, time travel, and validation inside one aggregate. Computed values, dependency graphs, selections, presence, and edit locks are derived or ephemeral state rather than canonical Topic data.

This deliberately rejects both whole-workbook snapshot persistence and a record-collection/database-view model. During development, existing databases may be deleted instead of migrated when the Note or SQLite schema changes; compatibility with previously stored databases is not part of this implementation.
