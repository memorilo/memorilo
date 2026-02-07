{
  pkgs,
  buildInputs,
}:
with buildInputs;
pkgs.mkShellNoCC {
  inherit nativeBuildInputs;
  buildInputs = iosBuildInputs;
  # Specify the rust-src path (many editors rely on this)
  RUST_SRC_PATH = "${pkgs.fenix.complete.rust-src}/lib/rustlib/src/rust/library";
  shellHook = ''
    export PATH="/usr/bin:/usr/sbin:/bin:/sbin:$PATH"
    export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

    export CC="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
    export CXX="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang++"

    export SDKROOT="$(xcrun -sdk iphoneos --show-sdk-path)"
    export CFLAGS="-isysroot $SDKROOT"
    export LDFLAGS="-isysroot $SDKROOT"
  '';
}
