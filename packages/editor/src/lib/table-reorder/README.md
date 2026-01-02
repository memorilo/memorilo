# Table Reorder Module

This directory contains the table reorder utilities split by responsibility. Import the public API from `./index` to keep call sites stable.

## Files

- `constants.ts`: Drag-and-drop type constants for table row/column handles.
- `types.ts`: Public drag payload interfaces for rows and columns.
- `paths.ts`: Helpers to resolve table/row paths from a cell path.
- `layout.ts`: Span-aware layout builders and logical column index lookup.
- `groups.ts`: Row/column grouping helpers for merged spans and shared column group metadata.
- `drag.ts`: Drag gating and drag item construction based on grouping rules.
- `move.ts`: Row/column move operations that preserve merged spans.
- `index.ts`: Barrel export for the public table reorder API.
