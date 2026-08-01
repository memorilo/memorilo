# Memorilo

Memorilo is an AGPL-licensed Electron desktop application organized as a pnpm and Turbo monorepo.

## Prerequisites

- Node.js 22.12.0 or newer
- Corepack, enabled with `corepack enable`
- pnpm 10.12.4, activated with `corepack prepare pnpm@10.12.4 --activate`

Install workspace dependencies from the repository root:

```sh
pnpm install
```

## Commands

```sh
pnpm dev         # Start the Electron development process
pnpm lint        # Lint every workspace package
pnpm typecheck   # Type-check every workspace package
pnpm test        # Run unit and component tests
pnpm build       # Build all packages in dependency order
pnpm test:e2e    # Build the desktop app and run Electron end-to-end tests
```

Turbo filters can limit a command to a package and its dependencies. For example, use
`pnpm turbo run test --filter=@memorilo/editor` or
`pnpm turbo run build --filter=@memorilo/desktop...`.

## Package Boundaries

- `apps/desktop` owns the coordinated electron-vite development and production builds.
- `apps/desktop/main` owns Electron main-process startup, IPC services, and persistence.
- `apps/desktop/preload` owns the context-isolated renderer bridge.
- `apps/desktop/renderer` owns the React application and browser-facing state.
- `packages/editor` owns the reusable editor UI and editor integrations.
- `packages/e2e` owns Playwright Electron end-to-end tests.

Import package public entry points instead of reaching into another package's source tree.

## Styling

Renderer and editor styles use StyleX. Keep component-level styles in `*.stylex.ts` modules
and reserve plain CSS for global resets, font faces, and third-party content styles. The
electron-vite build extracts StyleX output into the packaged renderer CSS bundle.

Renderer notifications use the globally mounted React-Toastify container. See
[`docs/renderer-toasts.md`](docs/renderer-toasts.md) for severity guidance, actions,
loading states, progress, dismissal, and accessibility usage.

## Native Dependencies

`better-sqlite3` ships a Node-API binary for supported Windows architectures, so the default
install does not compile it locally. After changing Electron versions or native modules, an
explicit native rebuild is available for machines with Python and Visual Studio C++ tools:

```sh
pnpm --filter @memorilo/desktop rebuild:native
```

The packaged application smoke test verifies that the shipped binary loads inside Electron.

## Database Schema

Run Drizzle Kit through the main-process package:

```sh
pnpm --filter @memorilo/desktop-main db:generate
pnpm --filter @memorilo/desktop-main db:migrate
pnpm --filter @memorilo/desktop-main db:studio
```

Generated migrations belong to the main-process package and should be reviewed before they
are applied.

## License

Memorilo is licensed under the GNU Affero General Public License v3.0 only. See `LICENSE`.
