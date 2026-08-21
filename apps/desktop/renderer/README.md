# Renderer source organization

The renderer follows a feature-first structure. Files belong to the capability that owns their behavior, tests, and StyleX styles.

```text
src/
  app/       renderer bootstrap, router, providers, window shell, and app-wide UI
  routes/    TanStack Router registration and route-to-feature adapters only
  features/  journals, learning, notes, reader, and shelf behavior
  shared/    domain-neutral interfaces and lifecycle support used across features
  i18n/      renderer internationalization setup
  settings/  the separate settings-window entry and UI
  styles/    package-wide CSS resets, fonts, and third-party content styles
  test/      package-wide test environment setup
```

Dependencies flow from `app/` and `routes/` into `features/`, then into `shared/`. A feature must not import `app/` or `routes/`; route parameters, search state, and navigation actions enter through narrow page props. Shared modules must not depend on features or application composition.

Tests and `*.stylex.ts` files stay beside the implementation they verify or style. `routes/` does not contain tests, styles, workflows, controllers, sessions, or reusable components.

Within a feature, use `workflow` only for the owner of a multi-step state and side-effect process. Use `session` only for its admission, supersession, cancellation, and shutdown boundary. Name pure domain calculations after the domain concept they model (for example, `rating-model`), and do not add parallel `controller`, `workspace`, or `coordinator` layers around the same process. A feature page owns the React subscription and rendering adapter for its workflow directly.

Renderer resources are acquired in the commit phase through `useOwnedResource`; render initializers must not create closeable resources because React may discard them without cleanup. If a feature owns several resources, compose their ordered cleanup inside the feature and expose one `close` operation to the React ownership hook. Each finalizer has exactly one owner.

The renderer composition root creates application resources only after configuration and i18n initialization succeeds. Its mount disposer must attempt every owned finalizer on both mount rollback and window shutdown, so a React unmount failure cannot skip Note persistence or other later cleanup.

Organize related URL segments in route directories. An `index.tsx` route and its sibling routes remain non-nested unless the directory defines a `route.tsx` layout; layout routes must render an `Outlet` for their children. A leading `-` is only TanStack's route-ignore convention; renderer implementation files live outside `routes/` and do not use that prefix.
