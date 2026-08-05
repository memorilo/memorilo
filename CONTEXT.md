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

**BookTopic**:
A Topic bound to one concrete BookFile. It keeps normal editable Topic content while owning that file's reading position and annotations.
_Avoid_: ReadingTopic, book registry entry

**Publication**:
Catalog metadata used to discover one or more downloadable renditions of a work. A Publication is not the identity of a BookTopic.
_Avoid_: BookFile, BookTopic

**BookFile**:
The exact readable bytes identified by their format and content hash. Different formats or byte revisions are different BookFiles.
_Avoid_: Publication, reading ID

**ReadingContext**:
The combination of a Note and one of its BookTopics selected when reading a BookFile.
_Avoid_: Reader ID, reading session

**Block**:
A content node inside a Topic.
_Avoid_: NoteEntry, Topic node

**Card**:
An independently identifiable learning item generated from Block content. Multiple Cards may share one source Block, and each Card keeps a stable CardID across ordinary content edits.
_Avoid_: Block, ClozeGroup

**ClozeGroup**:
One or more hidden content fragments that are revealed together by a Cloze Card. A group may combine rich-content ranges and formula-source fragments, but it is not the Card's identity.
_Avoid_: CardID, Cloze Card

**RichContentCloze**:
A Cloze whose hidden range belongs to a Block's rich content and may include text or embedded elements such as a whole formula.
_Avoid_: TextCloze, WholeMathCloze

**MathSourceCloze**:
A Cloze whose hidden range is a fragment inside a formula's LaTeX source.
_Avoid_: Formula Cloze, RichContentCloze

**ListCard**:
An ordered multi-item Card whose answer items are revealed and evaluated one at a time.
_Avoid_: Set Card, numbered Block

**Highlight**:
Memorization emphasis applied either to inline content or to an entire Block. A Highlight does not create a Card.
_Avoid_: Highlight Card, review hint
