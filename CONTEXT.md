# Memorilo

Memorilo organizes collaborative notes as nested entries with editable topic content.

## Language

**Note**:
A complete note whose entries, history, and collaborative state change together.
_Avoid_: Workspace, document collection

**NoteEntry**:
A position in a Note's hierarchy occupied by either a Folder or a Topic.
_Avoid_: Page, document node

**Folder**:
A NoteEntry that organizes other entries and has no editor content of its own.
_Avoid_: Empty Topic

**Topic**:
A NoteEntry with editable content that may also organize child entries.
_Avoid_: Page, editor document

**Block**:
A content node inside a Topic.
_Avoid_: NoteEntry, Topic node
