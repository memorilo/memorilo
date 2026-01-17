MODEL_DIR := "./src-tauri/models"

download-model:
  # Download VSCode Language Detection model files
  # https://github.com/microsoft/vscode-languagedetection
  just _download "{{MODEL_DIR}}/vscode-languagedetection.json" "https://github.com/microsoft/vscode-languagedetection/raw/refs/heads/main/model/model.json"
  just _download "{{MODEL_DIR}}/vscode-languagedetection.bin" "https://github.com/microsoft/vscode-languagedetection/raw/refs/heads/main/model/group1-shard1of1.bin"

download-web-resource:
  just _download-prismjs

_download-prismjs:
  #!/usr/bin/env bash
  set -e
  TARGET_DIR="public/prism"
  URL="https://github.com/PrismJS/prism/archive/refs/heads/master.zip"

  if [[ -d "$TARGET_DIR" ]]; then
    echo "$TARGET_DIR already exists, skipping download."
    exit 0
  fi

  echo "Downloading PrismJS from $URL..."
  TEMP_DIR=$(mktemp -d)
  ZIP_FILE="$TEMP_DIR/prism.zip"

  curl -L "$URL" -o "$ZIP_FILE"

  echo "Extracting components..."
  unzip -q "$ZIP_FILE" "prism-master/components/*" -d "$TEMP_DIR"

  mkdir -p public
  mv "$TEMP_DIR/prism-master/components" "$TARGET_DIR"

  rm -rf "$TEMP_DIR"
  echo "Done."


_download target url:
  #!/usr/bin/env bash
  set -e
  if [[ -f {{target}} ]]; then
    echo "{{target}} already exists, skipping download."
    exit 0
  fi
  mkdir -p $(dirname {{target}})
  curl -L {{url}} -o {{target}}


[linux]
[macos]
dev-desktop: download-model download-web-resource
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command cargo tauri dev
  else
    cargo tauri dev
  fi

[windows]
dev-desktop: download-model download-web-resource
  cargo tauri dev

[linux]
[macos]
build-desktop: download-model lint-rs
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command cargo tauri build
  else
    cargo tauri build
  fi

[windows]
build-desktop: download-model lint-rs
  cargo tauri build

build-android: download-model
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#android" --command cargo tauri android build
    nix develop ".#android" --command cargo tauri android build --split-per-abi
  else
    cargo tauri android build
    cargo tauri android build --split-per-abi
  fi

build-ios: download-model
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#ios" --command cargo tauri ios build
  else
    cargo tauri ios build
  fi

[linux]
[macos]
build-web: download-web-resource lint-web
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command bash -c "cd apps/client && pnpm build"
  else
    cd apps/client && pnpm build
  fi

[windows]
build-web: download-web-resource lint-web
  cd apps/client && pnpm build

clean:
  if [[ -d ./apps/client/dist ]]; then rm -rf ./apps/client/dist; fi
  cd ./src-tauri/ && cargo clean

clean-node_modules:
  find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +

build-bundle-size-stats:
  cd apps/client && VISUALIZER=true pnpm build
  rm -rf apps/client/dist

lint-web changed="false":
  #!/usr/bin/env bash
  if [ "{{changed}}" == "true" ]; then
    echo "Checking only changed files..."
    FILES=$(git diff --diff-filter=d --name-only HEAD | grep -E '^(apps|packages)/.*\.(ts|tsx|js|jsx|mjs|cjs|vue|json)$')
    if [ -z "$FILES" ]; then
      echo "No relevant changed files found."
      exit 0
    fi
    pnpm exec eslint $FILES
  else
    echo "Checking all files..."
    pnpm exec eslint apps packages
  fi

lint-rs changed="false":
  #!/usr/bin/env bash
  CLIPPY_CMD="cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings"

  if [ "{{changed}}" == "true" ]; then
    echo "Checking only changed files..."
    FILES=$(git diff --diff-filter=d --name-only HEAD | grep -E '^src-tauri/src/.*\.rs$')
    if [ -z "$FILES" ]; then
      echo "No relevant changed files found."
      exit 0
    fi
  else
    echo "Checking all files..."
  fi

  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command $CLIPPY_CMD
  else
    $CLIPPY_CMD
  fi
