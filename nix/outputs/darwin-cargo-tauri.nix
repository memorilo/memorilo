{
  pkgs,
  cargoTauri,
  extraDylibs ? [],
}:
if pkgs.stdenv.isDarwin then
  let
    # extraDylibs is a list of { name, path } pairs. We pass it into the shell
    # as newline-separated "name:path" entries for simple parsing.
    dylibLines = pkgs.lib.concatStringsSep "\n" (
      map (dylib: "${dylib.name}:${dylib.path}") extraDylibs
    );
  in
  pkgs.writeShellScriptBin "cargo-tauri" ''
    set -euo pipefail

    real="${cargoTauri}/bin/cargo-tauri"
    "$real" "$@"

    # Run the post-processing only when the command includes "build"
    # (e.g. "cargo tauri build", "cargo tauri build --verbose", etc).
    needs_post=false
    for arg in "$@"; do
      if [[ "$arg" == "build" ]]; then
        needs_post=true
        break
      fi
    done
    if [[ "$needs_post" != "true" ]]; then
      exit 0
    fi

    workspace="$(pwd)"
    dylib_lines='${dylibLines}'
    if [[ -z "$dylib_lines" ]]; then
      exit 0
    fi

    target_root="$workspace/src-tauri/target"
    if [[ ! -d "$target_root" ]]; then
      target_root="$workspace/target"
    fi

    mapfile -t apps < <(find "$target_root" -type d -path "*/bundle/macos/*.app" 2>/dev/null || true)
    if [[ ''${#apps[@]} -eq 0 ]]; then
      exit 0
    fi

    mapfile -t dylibs < <(printf '%s\n' "$dylib_lines")
    dylib_names=()
    for entry in "''${dylibs[@]}"; do
      dylib_names+=("''${entry%%:*}")
    done

    for app in "''${apps[@]}"; do
      frameworks="$app/Contents/Frameworks"
      mkdir -p "$frameworks"

      exe=""
      if [[ -f "$app/Contents/Info.plist" ]]; then
        exe=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist" 2>/dev/null || true)
      fi
      if [[ -n "$exe" ]]; then
        exe="$app/Contents/MacOS/$exe"
      else
        exe=$(find "$app/Contents/MacOS" -maxdepth 1 -type f -perm -111 | head -n 1 || true)
      fi

      for entry in "''${dylibs[@]}"; do
        name="''${entry%%:*}"
        src="''${entry#*:}"
        dest="$frameworks/$name"

        # Copy dylibs into the app bundle and normalize their install name to @rpath.
        cp -f "$src" "$dest"
        chmod 644 "$dest"
        /usr/bin/install_name_tool -id "@rpath/$name" "$dest"

        if [[ -n "$exe" && -f "$exe" ]]; then
          # Patch the main executable to use @rpath for these dylibs.
          if /usr/bin/otool -L "$exe" | grep -q "$src"; then
            /usr/bin/install_name_tool -change "$src" "@rpath/$name" "$exe"
          fi

          # Patch any other absolute paths that end with the same dylib name.
          while read -r line; do
            current_path=$(echo "$line" | awk '{print $1}')
            if [[ "$current_path" == "@rpath/$name" ]]; then
              continue
            fi
            if [[ "$current_path" == */"$name" ]]; then
              /usr/bin/install_name_tool -change "$current_path" "@rpath/$name" "$exe"
            fi
          done < <(/usr/bin/otool -L "$exe" | tail -n +2)

          if ! /usr/bin/otool -l "$exe" | grep -q "@executable_path/../Frameworks"; then
            /usr/bin/install_name_tool -add_rpath "@executable_path/../Frameworks" "$exe"
          fi
        fi

        # Also patch dependencies inside the copied dylib to point at @rpath.
        if [[ -f "$dest" ]]; then
          while read -r line; do
            dep_path=$(echo "$line" | awk '{print $1}')
            for dep_name in "''${dylib_names[@]}"; do
              if [[ "$dep_path" == "@rpath/$dep_name" ]]; then
                continue
              fi
              if [[ "$dep_path" == */"$dep_name" ]]; then
                /usr/bin/install_name_tool -change "$dep_path" "@rpath/$dep_name" "$dest"
              fi
            done
          done < <(/usr/bin/otool -L "$dest" | tail -n +2)
        fi
      done

      if [[ -n "$exe" && -f "$exe" ]]; then
        # Fail fast if any /nix store paths remain in the app binary.
        if /usr/bin/otool -L "$exe" | grep -q "/nix/"; then
          echo "error: still found /nix/ library references in $exe" >&2
          /usr/bin/otool -L "$exe" >&2
          exit 1
        fi
      fi

      for entry in "''${dylibs[@]}"; do
        name="''${entry%%:*}"
        dest="$frameworks/$name"
        # Fail fast if any bundled dylib still depends on /nix store paths.
        if [[ -f "$dest" ]] && /usr/bin/otool -L "$dest" | grep -q "/nix/"; then
          echo "error: still found /nix/ library references in $dest" >&2
          /usr/bin/otool -L "$dest" >&2
          exit 1
        fi
      done
    done

    mapfile -t dmgs < <(find "$target_root" -type f -path "*/bundle/dmg/*.dmg" 2>/dev/null || true)
    if [[ ''${#dmgs[@]} -eq 0 ]]; then
      exit 0
    fi

    for dmg in "''${dmgs[@]}"; do
      tmp_dir=$(mktemp -d)
      tmp_base="$tmp_dir/$(basename "$dmg" .dmg)-rw"
      /usr/bin/hdiutil convert "$dmg" -format UDRW -o "$tmp_base" >/dev/null
      rw_dmg="$tmp_base.dmg"

      mnt="$tmp_dir/mnt"
      mkdir -p "$mnt"
      /usr/bin/hdiutil attach -nobrowse -noverify -mountpoint "$mnt" "$rw_dmg" >/dev/null

      app_in_dmg=$(find "$mnt" -maxdepth 1 -type d -name "*.app" | head -n 1 || true)
      if [[ -n "$app_in_dmg" ]]; then
        app_name=$(basename "$app_in_dmg")
        src_app=""
        for app in "''${apps[@]}"; do
          if [[ $(basename "$app") == "$app_name" ]]; then
            src_app="$app"
            break
          fi
        done
        if [[ -z "$src_app" ]]; then
          src_app="''${apps[0]}"
        fi
        rm -rf "$mnt/$app_name"
        cp -R "$src_app" "$mnt/$app_name"
      fi

      /usr/bin/hdiutil detach "$mnt" >/dev/null
      rm -f "$dmg"

      out_base="$tmp_dir/out"
      /usr/bin/hdiutil convert "$rw_dmg" -format UDZO -imagekey zlib-level=9 -o "$out_base" >/dev/null
      mv "$out_base.dmg" "$dmg"
      rm -rf "$tmp_dir"
    done
  ''
else
  null
