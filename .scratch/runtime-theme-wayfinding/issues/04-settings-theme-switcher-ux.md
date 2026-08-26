# Settings Theme Switcher UX

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

What should the Settings page expose so users can compare and switch Fluent, Neubrutalism, and Liquid Glass confidently?

Decide through a small interactive prototype or concrete wireframe:

- placement and navigation label;
- whether each theme is represented by a radio group, segmented control, cards, or a compound preview;
- whether preview is live in the settings page only or applies to the whole app immediately;
- reset/default behavior, current-selection state, keyboard behavior, and screen-reader labeling;
- how the UI communicates that theme choice is saved and when it takes effect;
- how the design behaves at narrow widths and with high contrast/reduced motion.

The result should be a reusable settings control that consumes the same theme metadata and tokens as the runtime switcher, rather than a one-off showcase.

## Prototype

Throwaway UI prototype: [theme-switcher.html](../prototype/theme-switcher.html), served locally at `http://127.0.0.1:4178/theme-switcher.html`.

Variants:

- `?variant=A`: compact settings rows;
- `?variant=B`: theme card gallery;
- `?variant=C`: live preview split.

The prototype keeps family and appearance in memory only and does not mutate the real configuration store.

## Answer

Select **variant B: theme card gallery**.

The production Settings UI will use a dedicated Theme section in the General category:

- A reusable three-card gallery presents `Liquid Glass`, `Fluent UI`, and `Neubrutalism`. Each card has a short description and a compact visual preview sourced from the same static `ThemeDefinition` metadata used by the runtime theme registry.
- The selected family is a radio group. The selected card has a clear non-color-only state (border, focus/selection indicator, and accessible checked state).
- A separate segmented control selects `System`, `Light`, or `Dark` appearance. `System` follows the OS without changing the persisted value.
- Selecting either control updates the existing configuration immediately. The page displays a concise saved/current-state confirmation; no Apply button or confirmation dialog is needed.
- The control is keyboard navigable, exposes labels and checked state to assistive technology, and remains usable under high contrast and reduced motion. The card grid collapses to one column at narrow widths; the appearance control remains below the gallery.
- The settings page does not create a second live theme runtime for previews. The gallery is a static preview of theme metadata/tokens, while the actual Settings window updates through the same root theme application as the main renderer.

The throwaway prototype remains linked as the primary design reference in this ticket; losing variants are not production UI. This resolves the Settings UX decision and unblocks the shared component migration scope.
