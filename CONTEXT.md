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

**ImageOcclusionTopic**:
A Topic created from one image in a RegularTopic. It owns an immutable image snapshot and the occlusion definitions used to generate Cards.
_Avoid_: Image card, masked RegularTopic

**OcclusionShape**:
One rectangle, ellipse, or brush stroke placed over an ImageOcclusionTopic's image snapshot.
_Avoid_: Mask Card, OcclusionGroup

**OcclusionGroup**:
One or more OcclusionShapes that are hidden and revealed together as one Card.
_Avoid_: OcclusionShape, CardID

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

**SetCard**:
An unordered multi-item Card whose answer items are revealed together.
_Avoid_: Basic Card, ListCard, bulleted Block

**Sibling Group**:
All Cards projected from the same Source Block. Siblings remain independently scheduled but may be temporarily withheld from the same learning day by Bury policy.
_Avoid_: Note, Card Definition, shared Learning State

**Highlight**:
Memorization emphasis applied either to inline content or to an entire Block. A Highlight does not create a Card.
_Avoid_: Highlight Card, review hint

**Journal**:
The chronological workspace that starts with today's Journal Note and continues into earlier non-empty Journal Notes.
_Avoid_: Daily Notes, diary list

**Journal Note**:
A Note identified by exactly one Journal Date. Its displayed title is derived from that date and is not user-editable.
_Avoid_: Journal entry, dated page

**Journal Date**:
The local calendar date that uniquely identifies a Journal Note, independent of its creation and update timestamps.
_Avoid_: Created date, timestamp

**FSRS Optimizer**:
A reusable FSRS scheduling configuration assigned to Notes. Each Note has one effective FSRS Optimizer, while one FSRS Optimizer may be shared by multiple Notes.
_Avoid_: Deck, scheduler instance

**Global FSRS Optimizer**:
The permanent default FSRS Optimizer used by every Note without an explicit assignment. Its identity and name are fixed, but its scheduling configuration may change.
_Avoid_: Default deck, fallback scheduler

**Rating**:
The outcome selected after reviewing a Review Target: Again, Hard, Good, or Easy.
_Avoid_: Score, grade

**Learning State**:
A Review Target's current scheduling state derived from its retained review history under an FSRS Optimizer.
_Avoid_: Card content, review history

**Inactive Card**:
A Card that is no longer projected from current Note content but retains its review history and Learning State so the same CardID can resume later.
_Avoid_: Deleted Card, suspended Card

**Review Target**:
The smallest learning target that can receive a Rating and have its own Learning State. A regular Card has one whole-card target; a forward ListCard or SetCard instead has item targets identified by stable member Block identity.
_Avoid_: Card projection, review session

**Partial Card**:
A review presentation that asks for one difficult item from a ListCard or SetCard while the complete multi-item Card is temporarily withheld.
_Avoid_: New Card, independent Card Definition

**Bury**:
A queue policy that temporarily withholds an eligible Card or Review Target without changing its Rating history or Learning State.
_Avoid_: Suspend, delete, reschedule

**Archived FSRS Optimizer**:
An FSRS Optimizer that can no longer be assigned to Notes but is retained until database maintenance permanently removes it.
_Avoid_: Deleted Optimizer, disabled scheduler

**Study Day**:
A local learning period whose configurable boundary determines when buried Cards return and daily queue limits reset. It is not necessarily aligned with midnight.
_Avoid_: Calendar day, rolling 24 hours

**Reset Scheduling**:
An explicit restart of a Review Target's Learning State that retains earlier review history while excluding it from subsequent scheduling and optimization.
_Avoid_: Edit Card, delete review history

**Review Event**:
An immutable record of a Rating or scheduling command for one Review Target, retained as the source history from which Learning State is rebuilt.
_Avoid_: Review session, current Card state

**Personal Learning Sync**:
Account-scoped synchronization of a user's Review Events, Learning States, Optimizer revisions, and assignments across that user's devices; it is separate from collaborative Note content.
_Avoid_: Note collaboration, shared review state

**Sync Tombstone**:
A retained marker that tells another device an object or historical record was permanently removed during database maintenance.
_Avoid_: Inactive Card, archive
