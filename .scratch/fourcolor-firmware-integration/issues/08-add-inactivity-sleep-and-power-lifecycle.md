# Add inactivity sleep and power lifecycle

Status: in-progress
Blocked by: 03, 05, 06, 07

## Goal

Coordinate persistence, display completion, BLE/network activity, battery latch behavior, and ESP32 deep sleep.

## Scope

- Add inactivity timeout, manual sleep command, blocker leases, and GPIO0 wake.
- Prevent sleep during refresh, configuration commit, provisioning, or other critical work.
- Persist required state before sleep and restore a coherent page after wake.
- Keep the status LED off except for separately approved short error/acknowledgement signals.

## Acceptance criteria

- The MCU never sleeps during an in-flight refresh or configuration write.
- BLE and local-management blockers expire and cannot keep the device awake permanently after failure.
- Real-device tests cover timeout sleep, manual sleep, wake, pending refresh, and power loss recovery.

## Comments

- 2026-09-04: Power coordinator implements inactivity/manual sleep, expiring leases, persistence-before-sleep, GPIO0 wake, and LED-off normal behavior; physical current/wake validation remains tracked separately.
- 2026-09-05: Hardware diagnosis found that inactivity sleep while attached over
  native USB leaves Windows showing a non-responsive COM port that cannot accept
  the automatic download reset. Inactivity sleep is now blocked while external
  power is detected; physical sleep, wake, and post-idle flashing still require
  device verification.
