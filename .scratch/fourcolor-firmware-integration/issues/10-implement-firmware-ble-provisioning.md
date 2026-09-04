# Implement firmware BLE provisioning

Status: resolved
Blocked by: 03, 05, 06, 08, 09

## Goal

Implement the authenticated, short-lived provisioning peripheral in Rust with NimBLE.

## Scope

- Enable NimBLE and bonding persistence in the ESP-IDF configuration.
- Generate and display a six-digit passkey after UP+DOWN long press.
- Start advertising only after the passkey frame has physically completed.
- Expose authenticated GATT characteristics and apply validated configuration atomically.
- Stop advertising after success, cancellation, disconnect policy, or five-minute timeout.

## Acceptance criteria

- Configuration characteristics cannot be used without authenticated pairing and physical configuration mode.
- Advertising and BLE resources shut down after the session.
- Applying configuration returns a definitive status before disconnect/reconfiguration.
- The LED remains off and normal display/input safety invariants remain intact.

## Comments

- 2026-09-04: Firmware implementation and host tests are complete (`cargo test`: 47 passed), and the real ESP32-S3 release target builds successfully with BLE-only NimBLE, authenticated characteristics, physical-mode gating, atomic persistence, timeout/cancel cleanup, and display/power leases. Final authenticated pairing and lifecycle acceptance remains part of ticket 12's physical Windows end-to-end pass.
