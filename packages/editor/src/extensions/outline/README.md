# Outline extension

This folder contains the outline editor extension built on top of Tiptap list items.

## Features

- Bullet, ordered, and task outline items with folding support.
- Keyboard navigation between outline items (ArrowUp/ArrowDown, ArrowLeft for previous item end).
- Ordered list input rules (`1.` + space) and custom list indentation (Tab/Shift-Tab).
- Drag-and-drop reordering with drop indicators.
- Media-aware gap cursor handling so leading tables/images remain navigable.
- Task list toggling that preserves list type constraints.

## Implementation notes

- `outline.ts` composes the extension by registering nodes, plugins, and the gap cursor schema.
- Mixed list types are allowed temporarily in list containers so indent/outdent can normalize items in one transaction.
- List indentation commands mirror ProseMirror list logic but normalize item types to match their parent list.
- The table/media gap plugin prevents inserting text before leading media and redirects navigation to valid positions.
- Arrow navigation uses document positions rather than DOM geometry to stay deterministic.
- Drag-and-drop is split into geometry, indicator, and move logic for clarity and testability.

## Structure

- `core/`: shared constants, utilities, and type definitions.
- `nodes/`: document/heading nodes plus re-exports for list/item nodes.
- `list/`: list containers, list commands, and backspace handling.
- `item/`: item nodes, node view, and item-specific plugins.
- `plugins/`: ProseMirror plugins (navigation, ordered input, gap cursor).
- `dnd/`: drag-and-drop hit testing, indicator styling, and move logic.
- `outline.css`: outline-specific styling hooks.
- `index.ts`: external entry point re-exporting the Outline extension and types.
