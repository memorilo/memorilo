# Theme State and Persistence Contract

Type: decision
Status: resolved

## Question

What is the canonical domain model for a user's theme choice and its persistence?

Decide:

- whether the public setting is `fluent`, `neubrutalism`, `liquid-glass`, or a richer model such as visual family plus light/dark/system mode;
- the default on first launch and how it relates to the existing Liquid Glass direction and OS appearance;
- where the setting lives in the existing configuration schema and how renderer/main/preload boundaries expose it;
- whether changes apply immediately, survive restart, and synchronize across windows;
- how unknown, removed, or malformed stored values fall back;
- whether the setting is part of sync/export or remains device-local.

The answer must define a stable theme identifier and avoid leaking palette names into component APIs.

## Answer

The persisted theme preference has two independent dimensions:

```ts
type DesktopThemeFamily = 'liquid-glass' | 'fluent' | 'neubrutalism'
type DesktopThemeAppearance = 'system' | 'light' | 'dark'

interface DesktopThemePreference {
  family: DesktopThemeFamily
  appearance: DesktopThemeAppearance
}
```

`family` selects the visual language. `appearance` selects the light/dark presentation; `system` follows the operating-system color-scheme preference. The three families must not be multiplied into nine persisted product themes. Each family remains responsible for its own light/dark token preset and for honoring `prefers-contrast`, `prefers-reduced-transparency`, and `prefers-reduced-motion`.

The preference is added to the existing `DesktopConfiguration` and persisted in the existing local `configuration.json` flow. The main process remains the source of truth; preload broadcasts the normal configuration-changed event; every renderer configuration store updates through the existing `useSyncExternalStore` path. The preference is device-local application configuration: it is not part of note content, P2P synchronization, note export, or notebook backup data.

On first launch, when no stored theme preference exists, the default family is selected by the host OS: `liquid-glass` on macOS and `fluent` on Windows/Linux. The default appearance is `system`. A stored preference always wins over this first-launch default.

Selecting either dimension in Settings applies immediately and persists immediately. No confirmation dialog, restart, or renderer reload is required. Existing stateful editor/content components must remain mounted; only the theme application boundary and affected styles update. Other open windows receive the same configuration event and update as well.

Malformed or unknown stored family values are rejected by the configuration schema and fall back to `liquid-glass`; malformed appearance values also fall back to `system`. The fallback should use the existing configuration error-reporting path rather than passing arbitrary strings to the renderer. The implementation may expose a static `ThemeDefinition` registry keyed by stable family ids, leaving a narrow seam for a future fourth built-in family. Third-party runtime themes, Cordis, and a theme marketplace are out of scope.

This resolves the theme-state question and unblocks the semantic token contract ticket.
