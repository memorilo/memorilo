{
  pkgs,
  fenix,
  android-nixpkgs,
}:
let
  commonBulidInputs = with pkgs; [
    nodejs
    nodejs.pkgs.pnpm
    openssl
  ];

  cargoTauri = pkgs.cargo-tauri;

  # macOS-only dylibs to bundle into .app/Contents/Frameworks.
  # Add more entries here if new runtime deps appear.
  darwinDylibs = [
    {
      name = "libiconv.2.dylib";
      path = "${pkgs.libiconv}/lib/libiconv.2.dylib";
    }
    {
      name = "libcharset.1.dylib";
      path = "${pkgs.libiconv}/lib/libcharset.1.dylib";
    }
  ];

  darwinCargoTauriWrapper = import ./darwin-cargo-tauri.nix {
    inherit pkgs cargoTauri;
    extraDylibs = darwinDylibs;
  };

  nativeBuildInputs =
    with pkgs;
    [
      pkg-config
    ]
    ++ (pkgs.lib.optionals pkgs.stdenv.isLinux (
      with pkgs;
      [
        wrapGAppsHook4
      ]
    ));

  desktopBuildInputs =
    commonBulidInputs
    ++ (if pkgs.stdenv.isDarwin then [ darwinCargoTauriWrapper ] else [ cargoTauri ])
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
      with pkgs;
      [
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
      with pkgs;
      [
        darwin.cctools
        libiconv
      ]
    ));

  androidJdk = pkgs.jdk17;

  androidPackage = android-nixpkgs.sdk.${pkgs.system} (
    sdkPkgs: with sdkPkgs; [
      platform-tools
      ndk-26-1-10909125
      build-tools-35-0-0
      platforms-android-36

      cmdline-tools-latest
    ]
  );

  androidBuildInputs =
    commonBulidInputs
    ++ [ 
      pkgs.android-tools
      cargoTauri
    ]
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
    ++ [ cargoTauri ]
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
in
{
  inherit
    darwinCargoTauriWrapper
    nativeBuildInputs
    desktopBuildInputs
    androidBuildInputs
    iosBuildInputs
    androidJdk
    androidPackage
    ;
}
