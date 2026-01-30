{
  pkgs,
  buildInputs,
}:
with buildInputs;
pkgs.mkShell {
  inherit nativeBuildInputs;
  buildInputs = androidBuildInputs;
  # Specify the rust-src path (many editors rely on this)
  RUST_SRC_PATH = "${pkgs.fenix.complete.rust-src}/lib/rustlib/src/rust/library";
  JAVA_HOME = "${androidJdk}";
  ANDROID_HOME = "${androidPackage}/share/android-sdk";

  shellHook = ''
    export PATH=$PATH:${androidPackage}/share/android-sdk/cmdline-tools/latest/bin
    export NDK_HOME="$ANDROID_SDK_ROOT/ndk/$(ls -1 $ANDROID_SDK_ROOT/ndk/)";
  '';
}
