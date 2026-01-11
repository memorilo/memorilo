dev-desktop:
  cargo tauri dev

build-desktop:
  cargo tauri build

build-android:
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#android" --command cargo tauri android build
    nix develop ".#android" --command cargo tauri android build --split-per-abi
  else
    cargo tauri android build
    cargo tauri android build --split-per-abi
  fi

build-ios:
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#ios" --command cargo tauri ios build
  else
    cargo tauri ios build
  fi

clean:
  if [[ -d ./apps/client/dist ]]; then rm -rf ./apps/client/dist; fi
  cd ./src-tauri/ && cargo clean

build-web:
  cd apps/client && pnpm build

build-bundle-size-stats:
  cd apps/client && VISUALIZER=true pnpm build
  rm -rf apps/client/dist
