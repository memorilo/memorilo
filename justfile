set shell := ["bash", "-euo", "pipefail", "-c"]

# List available development commands.
default:
    @just --list

# Start the Electron desktop application.
dev-desktop:
    pnpm dev

# Start the Expo development client for the mobile application.
dev-mobile:
    nix develop .#default --command pnpm dev:mobile

# Build and launch the iOS development client on a named simulator.
dev-ios simulator="iPhone 17 Pro":
    nix develop .#ios --command pnpm mobile:ios --device "{{ simulator }}"

# Generate the Android API 35 AVD used by the repository-local emulator shell.
android-avd-create:
    nix develop .#android-emulator --command sdkmanager "platform-tools" "platforms;android-35" "system-images;android-35;google_apis;arm64-v8a"
    nix develop .#android-emulator --command avdmanager create avd --force --name memorilo-api35 --package "system-images;android-35;google_apis;arm64-v8a" --device pixel_7

# Build and launch the Android development client.
dev-android:
    nix develop .#android --command pnpm mobile:android

# List Simulator devices available through the installed Xcode.
ios-simulators:
    nix develop .#ios --command xcrun simctl list devices available

# List Android Virtual Devices stored in the repository-local Android home.
android-avds:
    nix develop .#android-emulator --command emulator -list-avds

# Start an Android emulator. Override with: just android-emulator another-avd
android-emulator avd="memorilo-api35":
    nix develop .#android-emulator --command emulator -avd "{{ avd }}"
