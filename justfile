MODEL_DIR := "./bundle/models"

download-model:
  # Download VSCode Language Detection model files
  # https://github.com/microsoft/vscode-languagedetection
  # Pinned to specific commit and checksums for security
  mkdir -p "{{MODEL_DIR}}"
  just _download "{{MODEL_DIR}}/vscode-languagedetection.json" "https://github.com/microsoft/vscode-languagedetection/raw/db2a0c35fe36d0fc2f658169b838b68708ff58d3/model/model.json" "100ce176367e7311e37ced0695057452991a8692029a79340a25e622893e7983"
  just _download "{{MODEL_DIR}}/vscode-languagedetection.bin" "https://github.com/microsoft/vscode-languagedetection/raw/db2a0c35fe36d0fc2f658169b838b68708ff58d3/model/group1-shard1of1.bin" "fab6442698f64d5b1d2df052061d12bafd570330556819d29f48c7bcbb5889f7"

download-web-resource:
  just _download-prismjs

_download-prismjs:
  #!/usr/bin/env bash
  set -e
  TARGET_DIR="public/prism"
  # Security: Pin to a specific version and verify checksum to prevent supply-chain attacks
  PRISM_VERSION="1.29.0"
  URL="https://github.com/PrismJS/prism/archive/refs/tags/v${PRISM_VERSION}.zip"
  # SHA256 of v1.29.0.zip
  EXPECTED_SHA256="e9fd561074d875de61f43f071c9e7e096cab5d7ed832351f25f3744c668f6332"

  if [[ -d "$TARGET_DIR" ]]; then
    echo "$TARGET_DIR already exists, skipping download."
    exit 0
  fi

  TEMP_DIR=$(mktemp -d)
  ZIP_FILE="$TEMP_DIR/prism.zip"

  # Use centralized download helper with checksum verification
  just _download "$ZIP_FILE" "$URL" "$EXPECTED_SHA256"

  echo "Extracting components..."
  # Extract components, handle variable root directory name (e.g. prism-1.29.0)
  unzip -q "$ZIP_FILE" "*/components/*" -d "$TEMP_DIR"

  mkdir -p public
  # Find the directory containing 'components' (it should be the only directory extracted)
  EXTRACTED_ROOT=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "prism-*" | head -n 1)
  
  if [[ -d "$EXTRACTED_ROOT/components" ]]; then
    mv "$EXTRACTED_ROOT/components" "$TARGET_DIR"
  else
    echo "Error: Could not find components directory in extracted zip."
    ls -R "$TEMP_DIR"
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  rm -rf "$TEMP_DIR"
  echo "Done."


_download target url checksum="":
  #!/usr/bin/env bash
  set -e
  
  CURRENT_SHA=""
  if [[ -f "{{target}}" ]]; then
    if [[ -n "{{checksum}}" ]]; then
       if command -v shasum >/dev/null 2>&1; then
         CURRENT_SHA=$(shasum -a 256 "{{target}}" | awk '{print $1}')
       elif command -v sha256sum >/dev/null 2>&1; then
         CURRENT_SHA=$(sha256sum "{{target}}" | awk '{print $1}')
       fi
       
       if [[ "$CURRENT_SHA" == "{{checksum}}" ]]; then
         echo "{{target}} already exists and checksum matches, skipping download."
         exit 0
       else
         echo "{{target}} exists but checksum mismatch. Re-downloading."
         echo "Expected: {{checksum}}"
         echo "Actual:   $CURRENT_SHA"
         rm "{{target}}"
       fi
    else
       echo "{{target}} already exists, skipping download."
       exit 0
    fi
  fi
  
  mkdir -p $(dirname "{{target}}")
  echo "Downloading {{target}}..."
  curl -L "{{url}}" -o "{{target}}"
  
  if [[ -n "{{checksum}}" ]]; then
    echo "Verifying checksum for {{target}}..."
    if command -v shasum >/dev/null 2>&1; then
      ACTUAL_SHA=$(shasum -a 256 "{{target}}" | awk '{print $1}')
    elif command -v sha256sum >/dev/null 2>&1; then
      ACTUAL_SHA=$(sha256sum "{{target}}" | awk '{print $1}')
    else
      echo "Warning: Neither shasum nor sha256sum found. Cannot verify integrity of {{target}}."
      exit 0
    fi
    
    if [[ "$ACTUAL_SHA" != "{{checksum}}" ]]; then
      echo "Error: Checksum mismatch for {{target}}!"
      echo "Expected: {{checksum}}"
      echo "Actual:   $ACTUAL_SHA"
      rm "{{target}}"
      exit 1
    fi
    echo "Checksum verified."
  fi


[linux]
[macos]
dev-desktop: download-model download-web-resource
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command cargo tauri dev --config src-tauri/tauri.dev.conf.json
  else
    cargo tauri dev --config src-tauri/tauri.dev.conf.json
  fi

[windows]
dev-desktop: download-model download-web-resource
  cargo tauri dev --config src-tauri/tauri.dev.conf.json

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
build-client: download-web-resource && lint-apps
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command pnpm build
  else
    pnpm build
  fi

[windows]
build-client: download-web-resource && lint-apps
  pnpm build

clean:
  find . -name 'dist' -type d -prune -exec rm -rf '{}' +
  find . -name '.turbo' -type d -prune -exec rm -rf '{}' +
  cd ./src-tauri/ && cargo clean

clean-node_modules:
  find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +

build-bundle-size-stats:
  cd apps/client && VISUALIZER=true pnpm build
  rm -rf apps/client/dist

lint-apps changed="false":
  #!/usr/bin/env bash
  run_pnpm() {
    if command -v nix >/dev/null 2>&1; then
      nix develop ".#default" --command pnpm "$@"
    else
      pnpm "$@"
    fi
  }

  if [ "{{changed}}" == "true" ]; then
    echo "Checking only changed files..."
    FILES=$(git diff --diff-filter=d --name-only HEAD | grep -E '^(apps|packages)/.*\.(ts|tsx|js|jsx|mjs|cjs|vue|json)$')
    if [ -z "$FILES" ]; then
      echo "No relevant changed files found."
      exit 0
    fi
    run_pnpm exec eslint $FILES
  else
    echo "Checking all files..."
    run_pnpm exec eslint apps packages
  fi

[linux]
[macos]
dev-web:
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command pnpm --filter @memorilo/web dev
  else
    pnpm --filter @memorilo/web dev
  fi

[windows]
dev-web:
  pnpm --filter @memorilo/web dev

[linux]
[macos]
build-web: download-web-resource
  #!/usr/bin/env bash
  if command -v nix >/dev/null 2>&1; then
    nix develop ".#default" --command pnpm --filter @memorilo/web build
  else
    pnpm --filter @memorilo/web build
  fi

[windows]
build-web: download-web-resource
  pnpm --filter @memorilo/web build


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
