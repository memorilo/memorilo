# Add diagnostics and release acceptance gates

Status: ready-for-human
Blocked by: 01, 03, 04, 07, 08

## Goal

Make the expanded firmware observable and prevent feature growth from silently regressing memory, power, input, or display behavior.

## Scope

- Add a hidden diagnostics page for build identity, heap/PSRAM, task stacks, battery, RTC, buttons, display state, BLE/Wi-Fi state, and last error.
- Retain the explicit color-bar build variant.
- Define feature-by-feature resource and real-device acceptance budgets.
- Keep unused peripherals powered down and omit unrelated upstream factory-test plumbing.

## Acceptance criteria

- Diagnostics can be entered deliberately and exited without reboot.
- Release checks fail or require explicit review when budgets regress.
- Host tests cover pure policies; target tests use the canonical ESP-IDF flashing workflow.

## Comments

- 2026-09-04: Diagnostics page, serial records, budget scripts, and host tests
  are complete. Final target acceptance needs COM3, real refresh/input/sleep
  runs, and an external inline current meter; no claim is made without those
  measurements.

## Comments

- 2026-09-04: Added the deliberate Settings long-press diagnostics page,
  cross-platform runtime snapshots, serial `DIAG` records, staged acceptance
  budgets, and partition-aware artifact checks. All 50 host tests pass and the
  `real-display` ESP-IDF release target builds. Re-generating the image exposed
  that the earlier 793,520-byte provisioning measurement was a stale `.bin`:
  the current image is 1,193,200 bytes (SHA-256
  `651739a994bbc4597c20394ab8171a66c6d13bc6155a0c7781f4a48646d3124a`).
  The official ESP-IDF `SINGLE_APP_LARGE` layout now provides a 1,536,000-byte
  factory partition, and flash preparation rejects stale or oversized images.
  Canonical `-WhatIf` preparation passes without a connected COM port. Physical
  diagnostics-page and runtime-budget acceptance remain pending because COM3
  is currently absent; no erase or write began.

- 2026-09-04: The current partition layout supersedes that earlier measurement:
  the generated application is 1,807,520 bytes with validation SHA-256
  `99acf3d646aeac22d90208c1ca79d4dbf897f7143d0226a5a7398030a60c092d`
  and fits the 3,145,728-byte factory partition. Canonical flash preparation
  succeeds, but `COM3` fails during port configuration with Windows error 31,
  before erase/write. PnP still reports the USB serial, composite, and JTAG
  interfaces healthy, so physical target acceptance remains pending.

- 2026-09-04: A complete canonical retry after USB reconnection failed during
  port configuration with Windows Error 31, before erase/write. The earlier
  attempt had connected and begun writing, but no complete image has been
  verified in this session.
