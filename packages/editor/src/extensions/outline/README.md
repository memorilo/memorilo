# Outline extension

This folder contains the outline editor extension built on top of Tiptap list items.

## Files

- `index.ts`: Re-exports the Outline extension and related option/types for external use.
- `outline.ts`: Composes the Outline extension by registering the custom bullet list and list item nodes, and passes HTML attributes into the bullet list.
- `outline-nodes.ts`: Defines the list nodes and wires in shared behavior (folding, keymaps, Enter/Backspace handlers).
- `outline-item-view.tsx`: React node view UI for a list item (bullet, fold button, content wrapper) plus level-based dashed connector line rendering.
- `outline-dnd.ts`: Drag-and-drop entry point wiring up indicator + move logic.
- `outline-dnd-geometry.ts`: DOM geometry helpers used by drag-and-drop hit testing.
- `outline-dnd-indicator.ts`: Drop indicator element creation and styling.
- `outline-dnd-move.ts`: Move/insert logic for drag-and-drop operations.
- `outline-dnd-types.ts`: Shared drag-and-drop types and constants.
- `outline-actions.ts`: Command helpers and keyboard shortcuts for folding, navigation, and indentation.
- `outline-list-commands.ts`: Custom sink/lift commands that support mixed listItem/taskItem structures.
- `outline-list-utils.ts`: Shared list helpers for type normalization and parent list lookup.
- `outline-node-constants.ts`: Shared node constants (content schemas, folded attributes).
- `outline-ordered-input.ts`: Ordered list input handling (e.g. `1.` + space conversion).
- `outline-list-backspace.ts`: Backspace handling for outline list items.
- `outline-item-enter.ts`: Enter handling for outline list items.
- `outline-node-helpers.ts`: Barrel file re-exporting the shared outline node helpers.
- `outline-utils.ts`: Shared utilities for identifying list containers and finding list items/positions.
- `types.ts`: Option and attribute types plus command type augmentation for Tiptap.
