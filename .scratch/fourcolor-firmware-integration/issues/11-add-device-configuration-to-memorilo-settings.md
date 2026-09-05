# Add device configuration to Memorilo settings

Status: resolved
Blocked by: 09

## Goal

Add a first-class Device category to the Memorilo settings window for BLE pairing and configuration.

## Scope

- Implement an Effect-based renderer provisioning service around Web Bluetooth.
- Add scanning, device selection, pairing-code entry, connection, read, edit, apply, disconnect, and forget states.
- Handle Electron `select-bluetooth-device` in the settings window.
- Handle PIN pairing through the Electron session on Windows/Linux and the system pairing flow on macOS.
- Expose only narrow, typed main/preload contracts; do not add a native BLE dependency.
- Add aligned English and Chinese locale keys.
- Add controls for the TODO HTTPS URL, read token, MQTT notification settings, enable flag, polling interval, and `today/all` view with redaction.

## Acceptance criteria

- UI is keyboard accessible and exposes scanning, pairing, loading, ready, applying, success, timeout, and failure states.
- Device configuration is separate from existing P2P/sync-server settings.
- Component and contract tests run with a fake Bluetooth adapter.
- Pairing callbacks are cancelled and cleaned up when the settings window closes.

## Answer

Implemented a first-class Device settings category backed by an Effect-based Web Bluetooth service and narrow Electron main/preload contracts. The page covers device discovery, explicit selection, all Electron PIN pairing variants, configuration reads and redacted secrets, validation, chunked apply/status handling, disconnect, forget, cancellation, timeout, and failure recovery. English and Chinese settings resources remain structurally aligned.

Verification completed with protocol tests, fake-adapter browser component tests, preload contract tests, main-process callback cleanup tests, renderer type checking, and a production Electron build. The production build requires a temporary 4 GB Node heap on this workstation because the renderer bundle exceeds Node's default 2 GB heap during transformation.

## Comments

- 2026-09-04: `@memorilo/device-provisioning`, desktop API, preload, main, and renderer targeted lint/typecheck/tests pass. Production `@memorilo/desktop` build passes with `NODE_OPTIONS=--max-old-space-size=4096`.
