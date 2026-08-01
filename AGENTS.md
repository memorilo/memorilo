## Project organization

Memorilo is an Electron application organized as a pnpm and Turbo monorepo.

- `apps/desktop` coordinates Electron development and production builds.
- `apps/desktop/main` owns the Electron main process and composes IPC services with persistence adapters.
- `apps/desktop/preload` owns the context-isolated renderer bridge and exposed contracts.
- `apps/desktop/renderer` owns the React application and browser-facing state.
- `packages/editor` owns reusable editor UI, state, extensions, and integrations.
- `packages/editor-storage` owns the platform-independent persistence workflow, SQLite schema, CRDT snapshot persistence, node projections, and search.
- Platform packages provide database-driver and embedding-model adapters to `packages/editor-storage`.
- `packages/e2e` owns Playwright Electron end-to-end tests.

Import packages through their public entry points. Do not reach into another package's private source tree.

Renderer and editor component styles use StyleX. Keep component styles in `*.stylex.ts`; reserve plain CSS for global resets, fonts, and third-party content.

## Development commands

Run commands from the repository root unless stated otherwise.

- Install dependencies: `pnpm install`
- Start Electron development: `pnpm dev`
- Build all packages: `pnpm build`
- Lint all packages: `pnpm lint`
- Type-check all packages: `pnpm typecheck`
- Run unit and component tests: `pnpm test`
- Run Electron end-to-end tests: `pnpm test:e2e`

Electron E2E tests must set `MEMORILO_E2E_HIDE_WINDOW=1` when launching the app so tests do not show a native window. Do not set this variable for normal development or production launches.

Use Turbo filters when working on a specific package:

- Editor tests: `pnpm turbo run test --filter=@memorilo/editor`
- Desktop build and dependencies: `pnpm turbo run build --filter=@memorilo/desktop...`
- Main-process tests: `pnpm turbo run test --filter=@memorilo/desktop-main`
- Renderer tests: `pnpm turbo run test --filter=@memorilo/desktop-renderer`
- Preload tests: `pnpm turbo run test --filter=@memorilo/desktop-preload`

## Dependency modifications

- Do not add or modify dependency patches (`pnpm patch`, `patchedDependencies`, `patch-package`, or equivalent) unless the user explicitly requests a patch.
- When a dependency defect appears to require patching, report the defect and ask the user how to proceed before changing dependency patch configuration or files.

## Debugging and verification

- Reproduce issues with the smallest relevant package command before running the full workspace suite.
- Use `pnpm dev` for interactive Electron debugging.
- After changing a package, run its targeted tests, lint, and type checking first.
- Before considering repository-wide work complete, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Run `pnpm test:e2e` for changes affecting Electron startup, IPC, preload contracts, persistence, packaging, or end-user workflows.
- Rebuild native Electron dependencies after changing Electron or native modules with `pnpm --filter @memorilo/desktop rebuild:native`.
- Keep database schema and queries inside `packages/editor-storage`; compose that module with platform adapters in the Electron main process.
- Review editor-storage schema changes before opening an existing database.

## Design skills

Use the `apple-design` skill when building or reviewing:

- Gesture-driven interactions such as drag, swipe, sheets, and direct manipulation.
- Spring animations, momentum, interruption, and velocity-aware transitions.
- Translucent materials, depth, typography, and Apple-style interface polish.
- Reduced-motion behavior and accessibility for animated interactions.
- UI work where responsiveness, spatial consistency, feedback, or restraint materially affects the experience.

Do not invoke it for routine non-visual changes where these design concerns do not apply.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `memorilo/memorilo`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a multi-context domain documentation layout. See `docs/agents/domain.md`.
