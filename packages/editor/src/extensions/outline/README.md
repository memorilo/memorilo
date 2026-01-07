# Outline extension

This folder contains the outline editor extension built on top of Tiptap list items.

## Files

- `index.ts`: Re-exports the Outline extension and related option/types for external use.
- `outline.ts`: Composes the Outline extension by registering the custom bullet list and list item nodes, and passes HTML attributes into the bullet list.
- `outline-nodes.ts`: Defines the list item/bullet list nodes, `folded` attribute, Enter/Backspace behavior, and registers commands/keymap.
- `outline-item-view.tsx`: React node view UI for a list item (bullet, fold button, content wrapper) plus level-based dashed connector line rendering.
- `outline-level-context.tsx`: React context for propagating outline nesting level to child node views.
- `outline-actions.ts`: Command helpers and keyboard shortcuts for folding, navigation, and indentation.
- `outline-utils.ts`: Shared utilities for identifying list containers and finding list items/positions.
- `types.ts`: Option and attribute types plus command type augmentation for Tiptap.
