# Audit Hotspots and Duplication

Type: grilling
Status: resolved

## Question

Which current modules are genuinely low-quality, inefficient, over-defensive, duplicated, dead, or too large for their ownership boundary, and which findings are actionable rather than stylistic preference?

The audit must cover at least:

- the large shared controls in `packages/ui` (`dialog`, `dropdown-menu`, `context-menu`, `editable-title`);
- the large editor task controls (`task-action-panel`, `task-repeat-picker`, and their occurrence/reminder/time companions);
- duplicated StyleX/theme literals across `packages/ui`, `packages/editor`, renderer features, and global CSS;
- ownership violations or accidental cross-feature coupling in the renderer;
- dead exports, defensive branches, repeated adapters, and avoidable re-renders where evidence can be gathered locally.

For every finding, decide severity, evidence, owning boundary, and whether the remedy is extraction, deletion, simplification, or acceptance. Exclude vendor code unless the integration boundary itself is the problem.

## Evidence gathered

- `packages/ui/src/components/dialog.tsx` (334 lines), `dropdown-menu.tsx` (323), and `context-menu.tsx` (313) contain real compound-component state, focus management, portal, keyboard, and dismissal behavior. Their size alone is not evidence of a shallow or low-quality module.
- `dropdown-menu.tsx` and `context-menu.tsx` duplicate menu-item discovery, keyboard movement, portal/context/ref plumbing, outside-pointer handling, Escape handling, and viewport positioning. A private shared menu core is a concrete extraction candidate; a single public mega-menu is not.
- `packages/editor/src/task/task-action-panel.tsx` (568 lines) owns date/span scheduling, reminder/repeat/time popovers, validation, persistence callbacks, and floating positioning. `task-repeat-picker.tsx` (539 lines) combines preset/custom recurrence UI, calendar rendering, normalization, and rule editing. These are feature-owned workflows with too much state and view composition in one module, not candidates for moving task semantics into `packages/ui`.
- Editor task controls import local `buttonStyles`, `formControlStyles`, and `floatingSurfaceStyles`, while the repository also exposes public `@memorilo/ui` Button, TextField, Dialog, menu, and segmented controls. This is an actual two-system primitive seam, not merely duplicate filenames.
- `uiColors`, `editorColors`, shelf theme variables, feature StyleX literals, and global/third-party CSS contain repeated palette, radius, shadow, and dark-mode values. New controls cannot currently derive all visual decisions from one semantic contract.
- `packages/editor/src/ui/context-menu/context-menu.tsx` is a domain adapter around `@memorilo/ui` ContextMenu plus editor actions, clipboard, outline, and image insertion. It is not a duplicate public primitive and should remain editor-owned.
- Renderer `shared/` currently has no imports from `features/`; `todo-calendar-cache` and `todo-calendar-color` are consumed by multiple features and are legitimate shared infrastructure. No ownership violation was found there.
- No dead export was proven by local search. Repeated `error instanceof Error ? ... : String(...)` branches indicate an error-normalization opportunity, but are not individually safe deletion targets. Treat them in the effect/error-contract ticket.

## Decision draft

1. **High — duplicate menu infrastructure.** Extract a private menu-core module for shared focus navigation, dismissal, portal, and positioning behavior. Keep `DropdownMenu` and `ContextMenu` as separate semantic interfaces; do not replace them with a prop-heavy universal menu.
2. **High — task workflow modules are too broad.** Split task scheduling state/validation from view sections and floating-surface composition. Keep recurrence, reminder, and calendar semantics in the editor/task module; do not promote those domain rules to `packages/ui`.
3. **High — two primitive systems.** Promote stable, multi-consumer primitives (button, text field, floating surface/popover, segmented control, and related accessibility behavior) into `packages/ui`; delete editor primitive APIs after consumers migrate. Keep editor adapters for ProseMirror focus and tooltip semantics.
4. **High — visual token ownership is fragmented.** Define one semantic token contract for shared controls and let package/features add only local semantic tokens. Preserve third-party integration variables at their integration seam.
5. **Accepted — file size is not itself a defect.** Keep `Dialog` and `EditableTitle` cohesive until a private seam or duplicated behavior is demonstrated. Judge depth by leverage and locality, not line count.
6. **Accepted — no proven dead code.** Do not delete exports or defensive branches without a usage/invariant proof. Centralize unknown-error normalization as part of the reliability ticket; delete only confirmed pass-through primitive APIs.
7. **Accepted — renderer shared ownership is sound.** Keep `todo-calendar-cache`, `todo-calendar-color`, and similar modules in `shared/` while they remain feature-neutral and multi-consumer. Revisit only if their interface or lifecycle becomes a concrete defect.

## Answer

Confirmed by the user. The audit decisions are:

1. **High — duplicate menu infrastructure.** Extract a private menu-core module for shared focus navigation, dismissal, portal, and positioning behavior. Keep `DropdownMenu` and `ContextMenu` as separate semantic interfaces; do not replace them with a prop-heavy universal menu.
2. **High — task workflow modules are too broad.** Split task scheduling state/validation from view sections and floating-surface composition. Keep recurrence, reminder, and calendar semantics in the editor/task module; do not promote those domain rules to `packages/ui`.
3. **High — two primitive systems.** Promote stable, multi-consumer primitives (button, text field, floating surface/popover, segmented control, and related accessibility behavior) into `packages/ui`; delete editor primitive APIs after consumers migrate. Keep editor adapters for ProseMirror focus and tooltip semantics.
4. **High — visual token ownership is fragmented.** Define one semantic token contract for shared controls and let package/features add only local semantic tokens. Preserve third-party integration variables at their integration seam.
5. **Accepted — file size is not itself a defect.** Keep `Dialog` and `EditableTitle` cohesive until a private seam or duplicated behavior is demonstrated. Judge depth by leverage and locality, not line count.
6. **Accepted — no proven dead code.** Do not delete exports or defensive branches without a usage/invariant proof. Centralize unknown-error normalization as part of the reliability ticket; delete only confirmed pass-through primitive APIs.
7. **Accepted — renderer shared ownership is sound.** Keep `todo-calendar-cache`, `todo-calendar-color`, and similar modules in `shared/` while they remain feature-neutral and multi-consumer. Revisit only if their interface or lifecycle becomes a concrete defect.

The evidence and decision draft above remain part of the audit record.
