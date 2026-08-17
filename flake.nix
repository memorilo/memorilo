{
  description = "Memorilo development environments";

  inputs = {
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    nixpkgs,
    utils,
    ...
  }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };
      pnpm = pkgs.pnpm.override {nodejs-slim = pkgs.nodejs-slim_22;};
      commonPackages = [pkgs.nodejs_22 pnpm pkgs.git pkgs.just];
      android = {
        compileApi = "36";
        emulatorApi = "35";
        buildToolsVersions = ["36.0.0" "35.0.0"];
        ndk = "27.1.12297006";
        ndkVersions = ["27.1.12297006" "27.0.12077973"];
        cmake = "3.22.1";
      };
      emulatorAbi =
        if pkgs.stdenv.hostPlatform.isAarch64
        then "arm64-v8a"
        else "x86_64";
      supportsAndroidEmulator =
        pkgs.stdenv.hostPlatform.isDarwin || pkgs.stdenv.hostPlatform.isx86_64;

      mkAndroidSdk = {
        withEmulator ? false,
        platformVersions ? [android.compileApi],
      }:
        (pkgs.androidenv.composeAndroidPackages ({
            inherit platformVersions;
            buildToolsVersions = android.buildToolsVersions;
            includeCmake = true;
            cmakeVersions = [android.cmake];
            includeNDK = true;
            ndkVersions = android.ndkVersions;
          }
          // pkgs.lib.optionalAttrs withEmulator {
            includeEmulator = true;
            includeSystemImages = true;
            systemImageTypes = ["google_apis"];
            abiVersions = [emulatorAbi];
          })).androidsdk;

      mkAndroidShell = sdk:
        pkgs.mkShell {
          packages = commonPackages ++ [pkgs.jdk17_headless sdk];
          ANDROID_HOME = "${sdk}/libexec/android-sdk";
          ANDROID_SDK_ROOT = "${sdk}/libexec/android-sdk";
          ANDROID_NDK_HOME = "${sdk}/libexec/android-sdk/ndk/${android.ndk}";
          ANDROID_NDK_ROOT = "${sdk}/libexec/android-sdk/ndk/${android.ndk}";
          JAVA_HOME = pkgs.jdk17_headless.home;
          shellHook = ''
            project_root="$(git rev-parse --show-toplevel)" || return 1
            export GRADLE_USER_HOME="$project_root/.gradle"
            export ANDROID_USER_HOME="$project_root/.android"
            export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
            export GRADLE_OPTS="''${GRADLE_OPTS:+$GRADLE_OPTS }-Dkotlin.compiler.execution.strategy=in-process -Dkotlin.daemon.runFilesPath=$GRADLE_USER_HOME/kotlin/daemon"
          '';
        };
      iosShell = pkgs.mkShellNoCC {
        packages = commonPackages ++ [pkgs.cocoapods];
        shellHook = ''
          export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
          unset AR AS CC CXX LD LDPLUSPLUS NM OBJCOPY OBJDUMP RANLIB SIZE STRINGS STRIP
          unset SDKROOT MACOSX_DEPLOYMENT_TARGET LD_DYLD_PATH
          unset NIX_CC NIX_BINTOOLS NIX_CFLAGS_COMPILE NIX_LDFLAGS
          export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
        '';
      };
    in {
      formatter = pkgs.alejandra;
      devShells =
        {
          default = pkgs.mkShell {
            packages = commonPackages;
          };
          android = mkAndroidShell (mkAndroidSdk {});
        }
        // pkgs.lib.optionalAttrs supportsAndroidEmulator {
          android-emulator = mkAndroidShell (mkAndroidSdk {
            withEmulator = true;
            platformVersions = [android.emulatorApi];
          });
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isDarwin {
          ios = iosShell;
        };
    });
}
