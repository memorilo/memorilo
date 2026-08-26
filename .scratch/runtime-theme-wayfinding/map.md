# Runtime Theme System for Fluent, Neubrutalism, and Liquid Glass

Label: wayfinder:map

## Destination

Produce an execution-ready specification and ordered implementation ticket set for a runtime-selectable UI theme system in Memorilo. The system must let users switch between Fluent UI, Neubrutalism, and the existing Apple Liquid Glass direction from the Settings page, update the running renderer without reload, reuse shared controls across all presets, preserve accessibility/platform constraints, and define a clear ownership boundary for tokens, theme state, portals, and feature-specific visuals.

This map does not implement the theme system. It is complete when the remaining implementation work has explicit contracts, ownership, settings behavior, migration order, acceptance criteria, and a decision on whether Cordis adds material value.

## Notes

Domain: desktop renderer, `packages/ui`, editor integrations, settings/configuration, and shared theme tokens.

Consult `apple-design` for Liquid Glass and reduced-motion/transparency behavior, `codebase-design` for deep module boundaries, `domain-modeling` when theme terminology or an architectural decision becomes durable, and `grilling` for unresolved human decisions. Existing repository direction uses StyleX and semantic theme tokens; do not assume Fluent UI should replace `@memorilo/ui`. Do not add a compatibility layer or persistent migration format unless a ticket proves it is needed. Do not add tests as a separate scope item; include focused verification in implementation acceptance where runtime theme changes are risky.

Cordis is an optional research input. Do not introduce it merely because it provides an event system; use it only if its scoped plugin/event model solves a concrete theme lifecycle or extension problem better than existing repository patterns.

## Decisions so far

- [Theme State and Persistence Contract](issues/01-theme-state-and-persistence.md): Persist a two-dimensional local preference (`family` = liquid-glass/fluent/neubrutalism, `appearance` = system/light/dark); default family by OS (macOS Liquid Glass, Windows/Linux Fluent), apply immediately across windows, keep it out of note sync/P2P, and fall back safely to Liquid Glass/system without Cordis.
- [Semantic Theme Contract Across Three Visual Families](issues/02-semantic-theme-contract.md): `packages/ui` owns shared semantic component contracts and invariants; an independent theme runtime owns family presets and appearance resolution; features keep only domain tokens, while Surface semantics hide material-specific differences.
- [Runtime Theme Application Boundary](issues/03-runtime-application-boundary.md): A per-window ThemeRuntime resolves the preference and OS appearance; DesktopConfigurationEnvironment applies one root theme class/attributes to `<html>`, so portals inherit it without remounting, while existing configuration IPC remains the only propagation channel.
- [Settings Theme Switcher UX](issues/04-settings-theme-switcher-ux.md): Use a reusable three-card family gallery plus a separate System/Light/Dark segmented control; apply immediately through the shared configuration/runtime path, with accessible selection state and one-column narrow layouts.
- [Shared Component Reuse and Migration Scope](issues/05-shared-component-reuse-and-migration.md): Migrate every public `@memorilo/ui` control to semantic tokens, keep editor behavior adapters and third-party integration styles local, delete obsolete duplicate primitives after migration, and use Fluent UI React v9 only as a reference.
- [Cordis Theme Lifecycle Assessment](issues/06-cordis-theme-lifecycle-assessment.md): Do not adopt Cordis for the three built-in themes; borrow only the narrow static definition/registration/disposer shape and reconsider only for a future third-party runtime theme ecosystem.
- [Implementation Sequence and Acceptance Criteria](issues/07-implementation-sequence-and-acceptance.md): Execute configuration, runtime/token foundation, shared controls, settings gallery, integration adapters, then focused and repository-wide verification in that order.

## Resolution

- No unresolved architecture decisions remain. Implementation tickets and acceptance gates are recorded in `issues/07-implementation-sequence-and-acceptance.md`.

## Out of scope

- Rewriting the entire renderer or replacing `@memorilo/ui` wholesale with Fluent UI.
- A user-authored theme editor, arbitrary token marketplace, or plugin marketplace.
- Rebuilding third-party Excalidraw, FullCalendar, or editor internals solely to make them visually identical to every preset.
- Changing product domain behavior, persistence semantics, or editor interaction rules unrelated to theme application.
- Committing code as part of charting this map.
