# Semantic Theme Contract Across Three Visual Families

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is the smallest semantic token and component-state contract that can express Fluent UI, Neubrutalism, and Liquid Glass without feature-level visual branching?

Decide:

- ownership of shared tokens between `packages/ui`, editor, renderer shell, and third-party integrations;
- semantic categories for content, surfaces/materials, borders/focus, intents, shape, elevation, typography, and motion;
- which differences are allowed between presets and which are accessibility/platform invariants;
- whether Liquid Glass translucency/material and Neubrutalism hard geometry belong in tokens, component variants, or dedicated surface primitives;
- how light/dark/high-contrast/reduced-motion/reduced-transparency states override a selected preset;
- which components share one API and which need a genuinely different compound surface.

The answer must include at least Button, TextField, Select, Dialog, Popover, Menu, Tabs, Sidebar, Toolbar, Status/Toast, Surface/Card, and editor adapters.

## Answer

Shared component contracts and theme definitions have separate owners:

- `packages/ui` owns the public component interfaces, shared semantic token contract, component states, native/ref/ARIA behavior, and accessibility invariants.
- A dedicated theme runtime/module owns `ThemeDefinition` metadata, the `liquid-glass`, `fluent`, and `neubrutalism` preset values, appearance resolution, and the static registration seam for future built-in themes.
- Feature packages may define domain-specific tokens, but must not redefine shared Button, TextField, Select, Dialog, Popover, Menu, Tabs, Sidebar, Toolbar, Status/Toast, Surface/Card, or editor-adapter semantics. Third-party integration variables remain at their integration seams.

The shared contract is semantic and layered:

```text
content:       text, textMuted, textQuiet, textOnAccent, placeholder
surface:       canvas, surface, surfaceRaised, surfaceSunken, overlay, scrim
material:      solid, translucent, acrylicLike, hardFlat
border/focus:  border, borderStrong, divider, focusRing
intent:        accent, accentHover, accentPressed, success, warning, danger,
               onSuccess, onWarning, onDanger
shape/depth:   controlRadius, surfaceRadius, pillRadius,
               controlStroke, surfaceStroke, controlShadow, surfaceShadow,
               overlayShadow
typography:    fontFamily, fontFamilyMono, bodySize, bodyLineHeight, headingWeight
motion:        motionFast, motionDefault, motionEasing
```

`Surface`/`Card` keeps one public visual interface with semantic variants such as `canvas`, `raised`, `overlay`, and `inset`; callers do not pass `themeFamily`, `material`, `hardShadow`, palette colors, or theme-specific geometry. Liquid Glass translucency, Fluent elevation, and Neubrutalism hard-flat geometry are preset decisions. Dialog, Popover, and Menu remain behaviorally distinct compound modules and may compose Surface internally.

Presets may vary colors, font stacks, bounded type scale, radii, stroke widths, elevation/material, density, and motion timing. The following remain invariant across presets: native semantics and refs; default/hover/pressed/focus-visible/disabled/selected/error/loading states; keyboard, Escape, focus return, and ARIA behavior; contrast, target size, high-contrast, reduced-motion, and reduced-transparency requirements; and all feature/domain behavior.

Runtime resolution applies the family preset first and then `system`/`light`/`dark` appearance. `prefers-contrast`, `prefers-reduced-motion`, and `prefers-reduced-transparency` are higher-priority accessibility overrides, not additional user-selectable theme combinations.

The implementation should keep the existing StyleX foundation and expose semantic variables through the `packages/ui` seam. Fluent UI React v9 remains a reference or optional isolated dependency, not the replacement implementation for `@memorilo/ui`.
