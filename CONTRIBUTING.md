### Modules Graph

```mermaid
graph TD
    Core["@memorilo/core"]
    Client["memorilo"]
    Components["@memorilo/components"]
    API["@memorilo/api"]
    Editor["@memorilo/editor"]
    Utils["@memorilo/utils"]

    Core-->Client
    Components-->Client
    API-->Client
    Editor-->Client
    Components-->Editor
    Utils-->Components
    Utils-->Client
```

### Development workflow

This repo uses Turborepo as the task runner. The standard entrypoint is:

- `just dev-desktop`
  - Downloads required model/assets.
  - Runs `cargo tauri dev` (via nix if available).
  - Tauri runs `beforeDevCommand` from `src-tauri/tauri.conf.json` (`pnpm dev`).
  - `pnpm dev` runs **Turborepo** (`turbo run dev`), which starts:
    - `apps/client` Vite dev server.
    - `packages/editor` Rollup watch.

You generally only need **one terminal** for desktop dev because Turbo watches editor builds automatically.

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

Turbo builds any package with a `build` script (currently `packages/editor` and `apps/client`). The final web output lives in `apps/client/dist`, which is what Tauri packages (`frontendDist`).
