# Add Wi-Fi and trusted local management

Status: ready-for-human
Blocked by: 06, 08, 12

## Goal

Use BLE-provisioned credentials to establish a power-aware Wi-Fi connection and an explicitly secured local management surface.

## Scope

- Add cancellable Wi-Fi connection/reconnect state and SNTP synchronization.
- Integrate radio activity with sleep blockers and resource budgets.
- Expose bounded local endpoints for status and approved device commands.
- Require authentication; do not copy the upstream open provisioning AP, fixed password, or unauthenticated control endpoints.

## Acceptance criteria

- Wrong credentials produce a recoverable status and can be replaced over BLE.
- Network failures do not block buttons, display scheduling, or sleep indefinitely.
- Mutating local requests are authenticated, bounded, serialized through `Application`, and audited in logs without secrets.

## Comments

- 2026-09-04: Software implementation and focused tests are complete. Physical
  Wi-Fi/SNTP, wrong-password replacement, authenticated HTTP, and sleep-lease
  acceptance require the NOTE4C on COM3 and a reachable private LAN.

## Comments

- 2026-09-04: Implemented the power-bounded ESP-IDF Wi-Fi/SNTP runtime, recoverable authentication-failure state, exponential retry cap, authenticated allowlisted HTTP commands, application-thread serialization, and secret-free audit events. `/v1/status` now returns a bounded synchronous JSON snapshot instead of enqueueing a no-op command. Host firmware tests pass (58 tests), and the canonical `flash-firmware.ps1 -WhatIf` path produced a verified 1,747,968-byte ESP32-S3 image within the 3 MiB factory partition.
- 2026-09-04: Added write-only local-management token provisioning to the Memorilo settings page. Tokens are generated in the Electron main process, applied over authenticated BLE, and persisted only after device acceptance using per-device `safeStorage` encryption. Main/preload/renderer focused tests, lint, and type checks pass. The protocol documentation now records token constraints, storage behavior, endpoint allowlist, bounds, and status codes.
- 2026-09-04: Physical Wi-Fi, SNTP, HTTP authentication/commands,
  wrong-password replacement, and sleep-behavior acceptance remain pending.
  Windows enumerates the target as `USB Serial Device (COM3)` with no PnP
  problem, but canonical flashing fails before erase/write while configuring
  the port with `PermissionError(13, ..., 31)`. The target must be physically
  reconnected or put back into download mode before target acceptance resumes.

- 2026-09-04: After reconnecting the target, another complete canonical flash
  retry reached `Connecting...` but failed with Windows Error 31 before
  erase/write. Wi-Fi and local-management acceptance remains blocked on a
  stable target flash.
