# Implementation Sequence and Acceptance Criteria

Type: execution-plan
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06

## Question

Once the preceding decisions are settled, what ordered implementation tickets and acceptance gates will deliver the runtime theme system safely?

The sequence must separate:

- configuration/schema and renderer notification;
- semantic token foundation and preset definitions;
- shared component migration;
- Settings page switcher and metadata/preview reuse;
- Liquid Glass/Fluent/Neubrutalism surface integrations;
- third-party/editor adapter decisions;
- focused lint, typecheck, component/UI checks, visual verification, and Electron end-to-end coverage proportional to risk.

The final answer should make it possible for implementation agents to work independently without reopening architecture decisions, and must state when the wayfinding effort is complete and execution can begin.

## Ordered implementation tickets

### 07A. Configuration contract and defaults

- Add `theme.family` and `theme.appearance` to the existing desktop configuration schema and TypeScript contract.
- Implement OS-aware first-launch defaults (macOS `liquid-glass`; Windows/Linux `fluent`; appearance `system`).
- Normalize malformed or unknown values to `liquid-glass` / `system` at the configuration boundary.
- Reuse the existing configuration persistence and `memorilo:configuration-changed` broadcast. Keep this data local to configuration; it must not enter note content, P2P, notebook export, or backup payloads.

Gate: schema/contract typechecks; existing configuration read/write and cross-window subscription paths remain intact.

### 07B. Theme runtime and semantic preset foundation

- Extract a pure renderer theme runtime with a static `ThemeDefinition` registry and a disposer-friendly registration seam for future themes.
- Define the semantic token contract in `packages/ui` and register `liquid-glass`, `fluent`, and `neubrutalism` presets.
- Resolve `system` through `matchMedia('(prefers-color-scheme: dark)')` without rewriting persisted configuration.
- Apply the active StyleX theme and `data-ui-theme-family` / `data-ui-theme-appearance` attributes to `document.documentElement` before the first React render, then update in place.

Gate: pure resolution is deterministic; OS changes update system appearance immediately; React/editor/query state stays mounted during changes; portals inherit the root theme.

### 07C. Shared control migration

- Migrate every public `@memorilo/ui` control to semantic tokens while preserving its public semantic variants, refs, native props, ARIA behavior, keyboard handling, focus return, and loading/disabled/selected/error states.
- Replace static `uiThemes.light` applications in `AppShell`, settings, and other renderer roots with the runtime root application.
- Migrate editor consumers to shared controls where visuals are general-purpose; keep editor behavior adapters and domain semantics local.
- Remove duplicate editor visual primitive styles only after their consumers have migrated.

Gate: all public consumers are family-aware; no component parses configuration or media queries itself; no family-specific public props are introduced.

### 07D. Settings gallery and persistence UX

- Add a dedicated Theme section to General settings using the Variant B three-card gallery.
- Derive card metadata and labels from the same `ThemeDefinition` registry used by the runtime; do not create a preview-only theme engine.
- Expose a separate accessible System/Light/Dark segmented control.
- Persist and apply on selection with no Apply button, confirmation, restart, reload, or editor remount; provide concise current/saved feedback.
- Update every supported settings locale in structural lockstep.

Gate: keyboard and screen-reader selection is observable; selected state is not conveyed by color alone; narrow layouts become one column; high contrast and reduced motion/transparency remain usable.

### 07E. Surface and integration adapters

- Tune Liquid Glass materials for translucency, blur, hierarchy, and portal surfaces; make reduced-transparency mode substantially more opaque/frosty.
- Tune Fluent surfaces, borders, typography, density, and elevation against Fluent UI references without adding Fluent UI React as a dependency.
- Tune Neubrutalism hard-flat surfaces, bounded heavy strokes, contrast, and restrained offset shadows without leaking palette-specific props into controls.
- Keep Excalidraw, FullCalendar, ProseMirror/ProseKit, and other vendor styles local; add only narrow supported token/class adapters where the integration exposes a stable seam.

Gate: no stacked translucent surfaces collapse legibility; dialogs/popovers/menus remain spatially anchored and accessible; reduced-motion removes movement/material animation while retaining state feedback.

### 07F. Verification and rollout

- Run focused lint, typecheck, and affected package checks after each implementation slice.
- Run renderer/UI visual verification for all families, light/dark/system, settings gallery, editor chrome, menus, dialogs, and portal content at desktop and narrow widths.
- Run Electron end-to-end coverage for configuration persistence, immediate switching, OS/system appearance updates, and cross-window synchronization. Use `MEMORILO_E2E_HIDE_WINDOW=1` for E2E launches.
- Before declaring completion, run repository-required `pnpm lint`, `pnpm typecheck`, and `pnpm test`; run `pnpm test:e2e` because startup, IPC, persistence, and end-user workflows are affected.

Gate: no reload or remount is required for switching; a second window converges on the same persisted preference; unknown values recover to the documented defaults; no theme data appears in note/P2P sync paths.

## Wayfinder completion

Tickets 01-07 are resolved. The map is complete and execution can begin. Cordis remains explicitly out of scope unless a future requirement introduces third-party runtime theme installation, theme dependency injection, or configuration-driven theme HMR.
