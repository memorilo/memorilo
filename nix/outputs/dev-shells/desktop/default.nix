{
  pkgs,
  buildInputs,
}:
with buildInputs;
pkgs.mkShell {
  inherit nativeBuildInputs;
  buildInputs = desktopBuildInputs;
  # Specify the rust-src path (many editors rely on this)
  RUST_SRC_PATH = "${pkgs.fenix.complete.rust-src}/lib/rustlib/src/rust/library";

  shellHook = ''
    # Ensure our cargo-tauri wrapper is used when running build commands.
    ${if pkgs.stdenv.isDarwin then "export PATH=${darwinCargoTauriWrapper}/bin:$PATH" else ""}
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath desktopBuildInputs}:$LD_LIBRARY_PATH
  '';
}
