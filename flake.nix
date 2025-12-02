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
    utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [fenix.overlays.default];
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };

      commonBulidInputs = with pkgs; [
        openssl
      ];

      packages = with pkgs; [
        nodejs
        nodejs.pkgs.pnpm
        cargo-tauri
        patchelf
        binutils
        file
        desktop-file-utils
      ];
      
      nativeBuildInputs = with pkgs;
        [
          pkg-config
        ]
        ++ (pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          wrapGAppsHook4
        ]));

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
        ++ (pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          at-spi2-atk
          atkmm
          cairo
          gdk-pixbuf
          glib
          glib.dev
          glib-networking
          gtk3
          librsvg
          libsoup_3
          pango
          webkitgtk_4_1
          dbus
          libayatana-appindicator
          gobject-introspection
          gsettings-desktop-schemas

          # this is needed for appimage
          stdenv.cc.cc.lib
          zlib
          libgpg-error 
          xorg.libX11
          xorg.libSM
          xorg.libICE
          xorg.libxcb
          fribidi
          fontconfig
          libthai
          harfbuzz
          freetype
          libglvnd
          mesa
          libgbm
          libdrm
          expat
        ]))
        ++ (pkgs.lib.optionals pkgs.stdenv.isDarwin (with pkgs; [
          libiconv
        ]));

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
    in {
      # Used by `nix develop`
      formatter = pkgs.alejandra;
      devShells = rec {
        desktop = pkgs.mkShell {
          inherit nativeBuildInputs packages;
          buildInputs = desktopBuildInputs;
          # Specify the rust-src path (many editors rely on this)
          RUST_SRC_PATH = "${pkgs.fenix.complete.rust-src}/lib/rustlib/src/rust/library";

          shellHook = ''
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath desktopBuildInputs}:$LD_LIBRARY_PATH
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS

            mkdir -p $TMPDIR/pkgconfig
            cp $(pkg-config --variable=pcfiledir gio-2.0)/gio-2.0.pc $TMPDIR/pkgconfig/gio-2.0.pc

            # Replace the schemasdir path
            substituteInPlace $TMPDIR/pkgconfig/gio-2.0.pc \
            --replace 'schemasdir=''${datadir}/glib-2.0/schemas' 'schemasdir=${pkgs.glib.dev}/share/glib-2.0/schemas'
            export PKG_CONFIG_PATH="$TMPDIR/pkgconfig:$PKG_CONFIG_PATH"
          '';
        };
        default = desktop;

        android = pkgs.mkShell {
          inherit nativeBuildInputs packages;
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
      };
    });
}
