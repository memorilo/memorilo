set shell := ["bash", "-euo", "pipefail", "-c"]

# List available development commands.
default:
    @just --list

# Start the Electron desktop application.
dev-desktop:
    pnpm dev

# List Simulator devices available through the installed Xcode.
ios-simulators:
    nix develop .#ios --command xcrun simctl list devices available

# List Android Virtual Devices stored in the repository-local Android home.
android-avds:
    nix develop .#android-emulator --command emulator -list-avds

# Start an Android emulator. Override with: just android-emulator another-avd
android-emulator avd="memorilo-api35":
    nix develop .#android-emulator --command emulator -avd "{{ avd }}"
