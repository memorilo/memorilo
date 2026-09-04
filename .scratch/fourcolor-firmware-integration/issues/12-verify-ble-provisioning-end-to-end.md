# Verify BLE provisioning end to end

Status: ready-for-human
Blocked by: 10, 11

## Goal

Validate the complete physical pairing and configuration experience between Memorilo and the device.

## Scope

- Test correct and incorrect passkeys, cancellation, timeout, reconnect, stale revisions, interrupted writes, and bond removal.
- Verify configuration persists across reboot and secrets cannot be read back.
- Measure BLE-session RAM and power overhead against the baseline.
- Cover Windows first, then record macOS and Linux validation status.

## Acceptance criteria

- A fresh device can be configured entirely from the Memorilo settings page.
- Normal mode does not advertise or accept configuration writes.
- The device stops BLE after completion or timeout and returns to the expected application page.
- Platform-specific limitations and required OS permissions are documented.

## Comments

- 2026-09-04: Host protocol, preload, main, and renderer coverage is complete.
  Physical Windows verification remains intentionally open: connect the NOTE4C
  on COM3, exercise correct/incorrect passkeys, timeout/cancel, reboot
  persistence, bond removal, and measure the BLE session. Do not mark this
  ticket resolved without that evidence.

- 2026-09-04: After reconnecting the target, another complete canonical flash
  retry reached `Connecting...` but failed with Windows Error 31 before
  erase/write. BLE physical acceptance remains pending until the USB-Serial/JTAG
  connection is stable and a complete image is verified.
