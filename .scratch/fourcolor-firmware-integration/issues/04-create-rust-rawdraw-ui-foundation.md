# Create the Rust RawDraw UI foundation

Status: resolved
Blocked by: 02, 03

## Goal

Create a Rust UI system inspired by upstream RawDraw without porting its C++ manager and callback hierarchy.

## Scope

- Semantic four-color tokens and reusable text, list, status, dialog, checkbox, progress, and selection primitives.
- Unicode-capable bitmap font lookup with bounded flash/RAM use.
- Text measurement, wrapping, clipping, pagination, and viewport behavior.
- Pure page rendering from application snapshots into the packed 2bpp framebuffer.

## Acceptance criteria

- Chinese and English TODO text render without placeholder glyphs.
- Long content wraps or paginates deterministically without corrupting selection mapping.
- UI tests cover color encoding, clipping, selection, wrapping, and pagination.
- C remains unaware of widgets, fonts, and page semantics.

## Comments

- 2026-09-04: RawDraw widgets, UTF-8 font/layout, clipping, pagination, and four-color snapshot rendering are implemented and host-tested.
