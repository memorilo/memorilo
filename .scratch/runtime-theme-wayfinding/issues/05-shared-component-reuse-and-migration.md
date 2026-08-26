# Shared Component Reuse and Migration Scope

Type: decision
Status: resolved
Blocked by: 02, 03

## Question

Which current shared and editor-owned controls must consume the new semantic contract, and where should feature-specific or third-party visuals remain local?

Audit current public consumers and decide the migration boundary for:

- `@memorilo/ui` controls and StyleX theme modules;
- editor buttons, form controls, surfaces, menus, dialogs, popovers, toolbars, tabs, and sidebars;
- renderer settings controls and app shell surfaces;
- Excalidraw, FullCalendar, ProseMirror/ProseKit, and other integration CSS;
- any Fluent UI React v9 components that are useful as references or dependencies.

The answer must specify public component APIs, adapter seams, deletion/compatibility policy, and the minimum shared-control set needed for all three presets to be credible. It must not promote domain behavior merely because its visuals are reused.

## Decision

### Shared migration scope

Every public control exported from `@memorilo/ui` is in scope for the first complete implementation. The minimum credible set is:

- `Button`, `ButtonGroup`, `TextField`, `SelectField`
- `Surface`, `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `ContextMenu`
- `SegmentedControl`, `Switch`, `Tabs`
- `Sidebar`, `Toolbar`, `Status`, and `EditableTitle`

The completion criterion is not that every control is rewritten in one commit. Staged migration is allowed, but every public consumer must be theme-aware before the wayfinder implementation is considered complete.

### Public interface and seam

Public controls keep semantic variants and native props. They consume semantic tokens from `packages/ui/src/theme.stylex.ts` (or the eventual theme-runtime module) and must not accept palette-specific props such as `themeFamily`, `material`, `hardShadow`, or raw theme colors. The theme runtime is the single seam that maps a registered `ThemeDefinition` plus resolved appearance to those tokens and root StyleX/data attributes.

Shared controls preserve their existing behavior and accessibility contract across presets: refs and native semantics, keyboard and Escape handling, focus return, ARIA state, loading/disabled/selected/error states, target sizes, contrast, high contrast, reduced motion, and reduced transparency.

### Local adapters that remain local

Editor-owned adapters stay in the editor package when they encode editor behavior rather than general visual semantics. This includes ProseMirror/ProseKit focus preservation, positioners, clipboard and editor-command affordances, and task/recurrence/calendar validation or mutation state. They may compose `@memorilo/ui` controls and semantic tokens but must not create a second theme registry.

Third-party integration styles remain at their integration seams. Excalidraw, FullCalendar, ProseMirror/ProseKit vendor styling, and similar embedded surfaces are not rewritten solely to make them visually identical to all three presets. Where an integration exposes a supported token or class override, an adapter may map the active semantic values into it; otherwise its existing local visuals are retained.

### Migration and compatibility policy

Renderer settings, app-shell surfaces, and editor consumers migrate to the public controls and root-applied theme. Obsolete duplicate editor visual primitive styles are deleted only after all consumers use the shared control; no long-lived compatibility aliases or parallel theme implementations are introduced. Domain semantics and feature-specific labels, validation, translations, and mutation states remain owned by their feature.

Fluent UI React v9 is a reference for Fluent tokens, slots, states, and accessibility patterns. It is not added as a runtime dependency and does not replace `@memorilo/ui`.

### Acceptance gates

- All public `@memorilo/ui` controls render correctly under the three registered families and light/dark/system appearance resolution.
- No public control requires a family-specific prop or reaches into another package's private source tree.
- Existing editor and renderer workflows retain behavior while consuming the shared controls.
- Third-party and editor integration seams remain isolated and do not introduce a second theme source of truth.
- Focused lint, typecheck, and UI checks cover each migrated package; visual verification includes portals, settings, editor chrome, and narrow renderer widths.
