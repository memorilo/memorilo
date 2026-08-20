# Todo subtask design

Status: implemented

## Goal

Todo subtasks reuse the editor's canonical Block tree. Users create a subtask by creating a Todo and indenting it with `Tab`; there is no separate subtask entity, relation editor, or add-subtask command.

The Todo workspace projects that mixed Block tree into a Todo-only tree for its list view. Other Todo views remain planning views over top-level Todos and do not repeat subtasks as independent flat items.

## Domain rules

### Subtask membership

A Todo is a Subtask when at least one of its Block ancestors is also a Todo. Its parent in the Todo-only tree is the nearest Todo ancestor, even when one or more non-Todo Blocks occur between them.

If every ancestor is non-Todo, the Todo is top-level.

```text
Todo A
  ordinary Block
    Todo B
      ordinary Block
        Todo C

ordinary Block
  ordinary Block
    Todo D
```

The Todo-only projection is:

```text
Todo A
  Todo B
    Todo C

Todo D
```

- B is a Subtask of A because A is its nearest Todo ancestor.
- C is a direct child of B in the Todo-only tree and an indirect descendant of A.
- D is top-level because none of its ancestors is a Todo.
- Non-Todo Blocks remain authoritative structural content, but they are not rendered in the Todo-only tree.

Subtask membership is derived from Block ancestry. It is not stored in the Note aggregate as a separate relationship.

### Editing

Document and Outline modes already edit the same canonical Block tree. Todo subtask creation therefore follows existing structural commands:

1. Create a Todo after another Block.
2. Press `Tab` to move it under the previous Block when that move is allowed by the active editor mode.
3. Additional indentation creates deeper Block ancestry and can produce arbitrarily nested Todo subtasks.
4. `Shift-Tab`, drag reparenting, deletion, undo, redo, and collaboration update the same relationship because they update the canonical tree.

Changing a Block's parent can promote a Subtask to a top-level Todo, attach a top-level Todo below a Todo ancestor, or move a Subtask to another Todo parent without changing its Block identity.

## Todo workspace presentation

### List view

The list view is the only Todo workspace view that displays subtasks.

- It eagerly loads every page of the filtered Todo result and rebuilds the tree as pages arrive. The hierarchy is complete once all pages are loaded; before that, a Todo whose parent has not arrived yet may temporarily appear as a root.
- It links each Todo to its nearest Todo ancestor and preserves the current Todo feed order among siblings.
- Each nesting level adds indentation to the tree control, status control, and task content as one visual unit.
- A Todo with visible Todo descendants has an expand/collapse control.
- Collapsing a Todo hides its complete Todo-only descendant subtree without changing the editor tree or persisted content.
- Expansion state belongs to the renderer view and is not collaborative or persisted.
- Non-Todo Blocks never appear as placeholder rows.

Calendar subscription events shown alongside the list are not Todos and do not participate in the Todo tree.

### Other views

Board, Timeline, Calendar, and Quadrant views receive only top-level Todos. A Subtask is not repeated as an independent planning item outside the list tree.

This is a presentation rule only. Hiding a Subtask from these views does not remove its dates, recurrence settings, reminders, status, or editor content.

## Automatic parent status

Automatic parent completion is controlled by `todo.autoCompleteParentTasks` and defaults to `true`.

Status reconciliation is authoritative in the main process and runs after both local Note mutations and imported renderer CRDT updates. Disabling the setting stops automatic parent changes but does not change subtask membership or list presentation.

### Direct-child rule

Automatic status uses direct Todo child Blocks, not all members of the Todo-only descendant tree.

For each Todo with at least one direct child Block whose kind is Todo:

- if every direct Todo child is `done`, the parent becomes `done`;
- if the parent is `done` and any direct Todo child is `todo` or `doing`, the parent becomes `todo`;
- otherwise the parent's current status is retained;
- non-Todo direct children are ignored;
- Todos below a non-Todo child do not participate in that parent's automatic status calculation.

This creates an intentional distinction:

```text
Todo A
  ordinary Block
    Todo B
```

B is displayed as a Subtask of A because A is its nearest Todo ancestor, but B is not a direct Todo child Block of A and therefore does not automatically complete or reopen A.

### Bottom-up reconciliation

Nested direct Todo chains reconcile from leaves to roots in one pass:

```text
Todo A
  Todo B
    Todo C (done)
```

If C's completion makes all of B's direct Todo children complete, B first becomes `done`. A is evaluated afterward using B's updated status, so A also becomes `done` when B is its only direct Todo child.

The reverse path also cascades. Reopening C can reopen B to `todo`, then reopen A to `todo` during the same reconciliation pass.

Automatic transitions use the normal task status transition rules. Completing a running parent settles its active elapsed-time span; reopening an automatically completed parent clears the checked state and restores status to `todo` rather than `doing`.

## Data projection

The Note's Loro-backed Topic document remains canonical. Todo queries use the rebuildable `topic_blocks` projection owned by `packages/editor-storage`.

`EditorTodoRepository.list()` computes `todoParentId` with a recursive SQLite query:

1. Start at each Todo Block's physical `parent_block_id`.
2. Walk upward within the same Note and Topic.
3. Stop at the first ancestor whose Block kind is `task`.
4. Return that Block ID as `todoParentId`; return `null` when no Todo ancestor exists.

The desktop API exposes `todoParentId` as optional for compatibility with task records produced before the projection existed. The renderer treats an explicit `null` as top-level. When the field is absent, it falls back to the physical `parentId` so older records retain their previous direct nesting behavior.

The projection does not add a database column or schema migration. Todo ancestry remains derivable from `topic_blocks.parent_block_id` and Block kind.

## Ownership

### `packages/editor`

- Owns the canonical Topic Block tree and existing `Tab`, `Shift-Tab`, drag, history, and collaboration behavior.
- Owns task status transition semantics such as checked state and elapsed timing.
- Does not own a separate Subtask model.

### `packages/editor-storage`

- Projects Todo Blocks from Topic content.
- Derives the nearest Todo ancestor as `todoParentId` when listing Todo tasks.
- Keeps Todo ancestry rebuildable from the canonical Block projection.

### `apps/desktop/main`

- Reads the automatic-parent setting.
- Reconciles direct Todo child statuses after accepted local and external Note updates.
- Persists and broadcasts any generated authoritative CRDT update.

### `apps/desktop/renderer`

- Builds and flattens the Todo-only list tree.
- Owns transient expand/collapse state and visual indentation.
- Filters subtasks out of Board, Timeline, Calendar, and Quadrant views.
- Invalidates Todo queries when Note updates arrive so structural edits are reflected in the workspace.

## Invariants

1. The editor Block tree is the only canonical subtask structure.
2. Every Todo has at most one parent in the Todo-only tree: its nearest Todo ancestor.
3. A Todo with no Todo ancestor is top-level, regardless of how many non-Todo ancestors it has.
4. Non-Todo Blocks are never rendered as nodes in the Todo-only list tree.
5. Subtasks are visible only in the Todo list view.
6. Expand/collapse never mutates Note content.
7. Automatic status considers only direct Todo child Blocks and runs bottom-up.
8. Disabling automatic parent completion does not alter hierarchy or manual status controls.

## Test coverage

- `apps/desktop/main/src/notes/todo-parent-status.test.ts` covers parent completion, reopening to `todo`, bottom-up multi-level cascading, non-Todo boundaries, and mixed child states.
- `apps/desktop/renderer/src/features/todo/todo-model.tree.node.test.ts` covers nearest-Todo ancestry, explicit top-level projection, arbitrary nesting, collapse visibility, legacy parent fallback, and hiding subtasks outside list view.
- `packages/editor-storage/src/editor-tasks.integration.test.ts` covers SQLite projection of the nearest Todo ancestor through non-Todo Blocks and `null` for Todos without a Todo ancestor.
- Existing Document and Outline interaction suites cover the structural indentation, reparenting, undo, redo, and mode behavior reused by subtask creation.

## Implemented modules

- `apps/desktop/main/src/notes/todo-parent-status.ts`
- `apps/desktop/main/src/notes/note-authoritative-runtime.ts`
- `apps/desktop/main/src/notes/note-authoritative-external-updates.ts`
- `apps/desktop/renderer/src/features/todo/todo-model.ts`
- `apps/desktop/renderer/src/features/todo/views/todo-list-view.tsx`
- `packages/editor-storage/src/editor-todo-repository.ts`
- `packages/editor-storage/src/editor-storage-contracts.ts`
- `packages/desktop-api/src/schemas/notes.ts`

## Resolved decisions

1. **Relationship source**: reuse the canonical Block tree; do not introduce a separate persisted Subtask relation.
2. **Todo-only parent**: use the nearest Todo ancestor, skipping non-Todo Blocks for list presentation.
3. **Creation flow**: use existing editor indentation rather than a dedicated add-subtask command.
4. **Workspace scope**: display subtasks only in List view; other Todo views show top-level Todos.
5. **Status scope**: automatic parent status uses physical direct Todo children, not every Todo-only descendant.
6. **Reopen status**: an automatically reopened parent returns to `todo`.
7. **Default behavior**: automatic parent completion is enabled by default and can be disabled in Settings.
