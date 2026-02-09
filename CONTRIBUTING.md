### Modules Graph

```mermaid
graph TD
    Core["@memorilo/core"]
    App["@memorilo/app"]
    Client["apps/client (tauri shell)"]
    Components["@memorilo/components"]
    API["@memorilo/api"]
    Editor["@memorilo/editor"]
    Utils["@memorilo/utils"]

    Core-->App
    Components-->App
    API-->App
    Editor-->App
    Components-->Editor
    Utils-->Components
    Utils-->App
    App-->Client
```

### Development workflow

This repo uses Turborepo as the task runner. The standard entrypoint is:

- `just dev-desktop`
  - Downloads required model/assets.
  - Runs `cargo tauri dev` (via nix if available).
  - Tauri runs `beforeDevCommand` from `src-tauri/tauri.conf.json` (`pnpm dev`).
  - `pnpm dev` runs **Turborepo** (`turbo run dev`), which starts:
    - `packages/app` route-tree generator (watch mode).
    - `packages/editor` Rollup watch.
    - `apps/client` Vite dev server.

You generally only need **one terminal** for desktop dev because Turbo watches editor builds and regenerates the route tree automatically.

If you want to run Vite directly (without Turbo), start the route generator first:

- `pnpm --filter @memorilo/app dev`
- `pnpm --filter @memorilo/client dev`

### Build workflow

All production builds start from the `just` targets:

- `just build-desktop`
  - Runs `cargo tauri build`.
  - Tauri runs `beforeBuildCommand` from `src-tauri/tauri.conf.json` (`just build-web`).
  - `just build-web` prepares web assets and runs `pnpm build`.
  - `pnpm build` runs **Turborepo** (`turbo run build`).

- `just build-android`
  - Runs `cargo tauri android build` (and split-per-abi).
  - Uses the same `beforeBuildCommand` chain above.

- `just build-ios`
  - Runs `cargo tauri ios build`.
  - Uses the same `beforeBuildCommand` chain above.

Turbo builds any package with a `build` script (currently `packages/app`, `packages/editor`, and `apps/client`). The final web output lives in `apps/client/dist`, which is what Tauri packages (`frontendDist`).

Notes:

- `packages/app/src/routeTree.gen.ts` is generated; do not edit it manually.
- `apps/client` is a thin Vite/Tauri shell that imports `@memorilo/app`.
