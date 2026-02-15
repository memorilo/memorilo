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

    # Prevent Nix Wrapper on MacOS
    ${
      if pkgs.stdenv.isDarwin then ''
        export TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64"

        export CC_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android24-clang"
        export CXX_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android24-clang++"

        export CC_armv7_linux_androideabi="$TOOLCHAIN/bin/armv7a-linux-androideabi24-clang"
        export CXX_armv7_linux_androideabi="$TOOLCHAIN/bin/armv7a-linux-androideabi24-clang++"

        export CC_i686_linux_android="$TOOLCHAIN/bin/i686-linux-android24-clang"
        export CXX_i686_linux_android="$TOOLCHAIN/bin/i686-linux-android24"

        export CC_x86_64_linux_android="$TOOLCHAIN/bin/x86_64-linux-android24-clang"
        export CXX_x86_64_linux_android="$TOOLCHAIN/bin/x86_64-linux-android24-clang++"

        export CC=clang
        export CXX=clang++
      '' else ''''
    }
  '';
}
