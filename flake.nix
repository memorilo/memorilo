{
  description = "Tauri Javascript App";

  inputs = {
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    utils.url = "github:numtide/flake-utils";

    android-nixpkgs.url = "github:tadfisher/android-nixpkgs";
  };

  outputs = {
    self,
    nixpkgs,
    utils,
    fenix,
    android-nixpkgs,
    ...
  } @ inputs:
    utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [fenix.overlays.default];
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        commonBulidInputs = with pkgs; [
          nodejs
          nodejs.pkgs.pnpm
          cargo-tauri
          openssl
        ];

        nativeBuildInputs = with pkgs;
          [
            pkg-config
          ]
          ++ (pkgs.lib.optionals pkgs.stdenv.isLinux (
            with pkgs; [
              wrapGAppsHook4
            ]
          ));

        desktopBuildInputs =
          commonBulidInputs
          ++ (with pkgs.fenix; [
            (combine [
              complete.cargo
              complete.rustc
              complete.rust-src
              complete.clippy
              complete.rustfmt
            ])
          ])
          ++ (pkgs.lib.optionals pkgs.stdenv.isLinux (
            with pkgs; [
              at-spi2-atk
              atkmm
              cairo
              gdk-pixbuf
              glib
              glib-networking
              gtk3
              librsvg
              libsoup_3
              pango
              webkitgtk_4_1
              dbus
              libayatana-appindicator
            ]
          ))
          ++ (pkgs.lib.optionals pkgs.stdenv.isDarwin (
            with pkgs; [
              libiconv
            ]
          ));
        androidJdk = pkgs.jdk17;

        androidPackage = android-nixpkgs.sdk.${pkgs.system} (
          sdkPkgs:
            with sdkPkgs; [
              platform-tools
              ndk-26-1-10909125
              build-tools-35-0-0
              platforms-android-36

              cmdline-tools-latest
            ]
        );

        androidBuildInputs =
          commonBulidInputs
          ++ (with pkgs.fenix; [
            (combine [
              complete.cargo
              complete.rustc
              targets.aarch64-linux-android.latest.rust-std
              targets.armv7-linux-androideabi.latest.rust-std
              targets.i686-linux-android.latest.rust-std
              targets.x86_64-linux-android.latest.rust-std
            ])
          ])
          ++ (with pkgs; [
            gnumake
            androidPackage
            androidJdk
          ]);

        iosBuildInputs =
          commonBulidInputs
          ++ (with pkgs.fenix; [
            (combine [
              complete.cargo
              complete.rustc
              targets.aarch64-apple-ios.latest.rust-std
              targets.aarch64-apple-ios-sim.latest.rust-std
              targets.x86_64-apple-ios.latest.rust-std
            ])
          ])
          ++ (with pkgs; [
            cocoapods
            libimobiledevice
          ]);
      in {
        # Used by `nix develop`
        formatter = pkgs.alejandra;
        devShells = rec {
          desktop = pkgs.mkShell {
            inherit nativeBuildInputs;
            buildInputs = desktopBuildInputs;
            # Specify the rust-src path (many editors rely on this)
            RUST_SRC_PATH = "${pkgs.fenix.complete.rust-src}/lib/rustlib/src/rust/library";

            shellHook = ''
              export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath desktopBuildInputs}:$LD_LIBRARY_PATH
            '';
          };
          default = desktop;

          android = pkgs.mkShell {
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
          };
          ios = pkgs.mkShellNoCC {
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
          };
        };
      }
    );
}
