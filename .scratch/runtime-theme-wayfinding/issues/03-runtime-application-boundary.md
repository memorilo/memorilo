# Runtime Theme Application Boundary

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

How should a theme change propagate through the live Electron renderer without reload or component-specific branching?

Compare a renderer-root CSS class/StyleX theme, a React provider/context, CSS custom properties, and a hybrid. Decide:

- the single application boundary and whether nested feature themes are allowed;
- how portals, dialogs, popovers, menus, editor positioners, and third-party integration roots inherit the active preset;
- how to prevent stale theme snapshots and avoid remounting stateful editor/content components;
- how main/preload configuration updates notify the renderer, including multi-window behavior if relevant;
- how SSR/pre-render, hot reload, and startup flash are handled;
- how the selected theme is observable for analytics/debugging without making theme state a global event soup.

The answer must identify the public module that owns the runtime transition and the escape hatch for a future fourth preset.

## Answer

Use a hybrid runtime with one source of truth:

- A pure `ThemeRuntime` module owns `ThemeDefinition` lookup, `{ family, appearance }` resolution, OS media-query observation, and the static registration seam for a future fourth built-in family.
- `DesktopConfigurationEnvironment` is the renderer integration seam. It subscribes to the existing configuration store, asks `ThemeRuntime` for the resolved theme, and applies the StyleX theme class plus `data-ui-theme-family` and `data-ui-theme-appearance` attributes to `document.documentElement`.
- A React context exposes the resolved theme state and setting action to Settings and other UI that needs to display the current choice. Components do not independently parse configuration or media queries.

The document root, not `AppShell` or a feature container, is the theme application boundary. This is required because Dialog, DropdownMenu, ContextMenu, Popover, Toast, and several editor adapters render through portals attached to `document.body`. Root-level theme variables therefore apply to both normal content and portal content in every renderer window, including the separate Settings window. Feature-level theme switching and nested runtime theme trees are not allowed. A Settings preview may use static metadata or an isolated preview surface, but it must not establish a second live theme runtime.

When `appearance` is `system`, `ThemeRuntime` observes `matchMedia('(prefers-color-scheme: dark)')` and updates the resolved preset immediately when the OS changes. This is derived state and is never written back to configuration. Explicit `light` or `dark` stops OS following until the user selects `system` again.

Before the first `root.render`, the renderer bootstrap applies the best available theme root state. If configuration is not yet available, the provisional family is `liquid-glass` on macOS and `fluent` on Windows/Linux, with appearance resolved from the OS; the stored configuration replaces it once the configuration store is ready. Theme changes update root classes/attributes and CSS variables without remounting React, editor, or query state. Color/material transitions may be short and interruptible; layout, font metrics, and geometry must not use long transitions. `reduceMotion` and `prefers-reduced-motion` remove movement/material animation while retaining necessary state/color feedback.

Multi-window propagation continues through the existing main-process configuration store and `memorilo:configuration-changed` preload channel. No `theme/changed` channel or global event bus is added. Each window owns one ThemeRuntime instance derived from its configuration store and applies the same resolved result to its own document root.

The public extension seam is the static `ThemeDefinition` registry consumed by `ThemeRuntime`; it does not expose palette-specific props to components and does not introduce Cordis.
