# Theme Contract and Token Ownership

Type: grilling
Status: resolved

## Question

What is the minimal shared theme contract that lets controls support materially different themes without scattering colors, radii, shadows, typography, and motion decisions across features?

Decide:

- the semantic token vocabulary and which values are component contract versus theme preset;
- the single ownership location for shared tokens across `packages/ui`, `packages/editor`, renderer shell/features, and global/third-party CSS;
- how StyleX `defineVars` and runtime theme application should compose with existing editor/shelf-specific tokens;
- which controls are the first extensibility target and which styles stay feature-specific;
- whether the contract is preset-only for now, with settings selection deferred, or includes a stable theme identifier boundary.

The result must remain compatible with large visual differences between presets while keeping component APIs semantic rather than palette-specific.

## Evidence gathered

- `packages/ui/src/theme.stylex.ts` currently owns only seven color variables plus a small motion object. Component styles still embed radii, shadows, typography, hover/active colors, and surface values directly in each `*.stylex.ts` file.
- `packages/editor/src/common/editor-theme.stylex.ts`, `apps/desktop/renderer/src/features/shelf/shelf-shared.stylex.ts`, `note-shared.stylex.ts`, `learning/optimizer/learning-optimizer-shared.stylex.ts`, and `packages/reader/src/reader-theme.stylex.ts` each define parallel `defineVars` groups. Several repeat the same accent, focus, canvas, text, muted text, and motion values under different names.
- `packages/config/src/configuration-fields.stylex.ts` and renderer global CSS contain additional light/dark literal branches. Global CSS also owns FullCalendar variables and Excalidraw integration overrides; those are integration seams, not shared control tokens.
- The configuration schema currently has language and `reduceMotion` but no appearance/theme field. `DesktopConfigurationEnvironment` already applies document-level settings (`lang`, `data-reduce-motion`) and wraps the app in `MotionConfig`, so it is the natural runtime seam if a theme identifier is added later.
- StyleX 0.19 exposes `defineVars` and `createTheme`. The package can therefore own a typed shared token group plus compiled preset classes, while the renderer composition root applies one theme class to the app root. Components continue to consume semantic vars and do not need palette-specific props.
- `@memorilo/ui` is already a dependency of renderer and editor, while the reverse direction does not exist. It is the cleanest owner for shared control tokens. Feature packages can keep local tokens for domain-specific surfaces, but shared control values should not be redefined there.
- Existing accessibility adaptations (`prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast`) are scattered across StyleX files. A theme contract must preserve these as semantic states/overrides rather than hide them in one palette preset.

## Decision draft

1. **Shared token owner:** make `packages/ui` the sole owner of the shared control token contract and its compiled theme presets. Export semantic variables, not raw palette names. Keep feature/domain tokens in their owning package only when they are not shared control semantics; third-party variables stay at the integration seam.
2. **Token vocabulary:** define a deliberately small semantic set covering content (`text`, `textMuted`, `textQuiet`, `textOnAccent`, `placeholder`), surfaces (`canvas`, `surface`, `surfaceRaised`, `surfaceSunken`, `scrim`), borders/focus (`border`, `borderStrong`, `divider`, `focusRing`), intents (`accent`, `accentHover`, `accentPressed`, `danger`, `success`, `warning`), shape/depth (`controlRadius`, `surfaceRadius`, `pillRadius`, `controlShadow`, `surfaceShadow`, `overlayShadow`), and interaction (`motionFast`, `motionDefault`, `motionEasing`). Component-specific styles may derive from these but must not expose palette-specific props.
3. **StyleX application:** use `stylex.defineVars` for the contract and `stylex.createTheme` for presets. Apply one shared theme class at the renderer composition root; allow nested feature themes only when a feature has a genuinely distinct domain surface. Use semantic media-state overrides for reduced motion/transparency/high contrast. Do not use a runtime inline-style token dictionary.
4. **Full extensibility scope:** migrate all identified shared controls in `packages/ui` (including Button, TextField, Dialog/Overlay, menu primitives, SegmentedControl, Switch, EditableTitle, Tabs, Sidebar, Status, Toolbar, ButtonGroup, and shared surface styles) and all editor-owned duplicate shared primitives identified by the audit. Implementation may be staged, but the target contract is not limited to a first batch. Keep task/calendar/reader/whiteboard domain visuals feature-owned unless a control is a genuine shared primitive.
5. **Theme settings boundary:** establish the token/preset interface now, but defer a persisted user-facing theme identifier and settings control. The current requirement is extensible controls; adding a settings field before the preset set and fallback behavior are defined would create an unstable configuration contract.
6. **Visual-difference rule:** presets may differ substantially in palette, radius, depth/material, typography scale, and motion timing, but component interfaces remain semantic. Accessibility media states and reduced-motion behavior are invariants every preset must satisfy.

This draft awaits HITL confirmation before becoming the ticket resolution.

## Answer

Confirmed by the user, with the extensibility scope expanded from a first batch to the full set of identified shared controls.

1. **Shared token owner:** `packages/ui` is the sole owner of the shared control token contract and compiled theme presets. Feature/domain packages retain only genuinely local tokens; third-party variables remain at their integration seams.
2. **Token vocabulary:** use a small semantic set for content, surfaces, borders/focus, intents, shape/depth, and interaction. Components consume semantic variables and do not expose palette-specific props.
3. **StyleX application:** use `defineVars` plus `createTheme`, apply one shared theme class at the renderer composition root, and preserve semantic reduced-motion/transparency/high-contrast overrides. Do not add a runtime inline token dictionary.
4. **Full scope:** cover all identified shared controls in `packages/ui` and all editor-owned duplicate shared primitives. Migration may be staged for execution, but the specification's end state is full coverage, not a first-batch subset. Domain-specific task, calendar, reader, and whiteboard visuals remain feature-owned.
5. **Settings boundary:** establish the token/preset interface now, but defer a persisted user-facing theme identifier and settings control until preset fallback behavior and the configuration contract are defined.
6. **Visual-difference rule:** presets may differ substantially in palette, radius, depth/material, typography scale, and motion timing, while accessibility media-state and reduced-motion invariants remain mandatory.

The evidence and decision draft above remain part of the theme architecture record.
