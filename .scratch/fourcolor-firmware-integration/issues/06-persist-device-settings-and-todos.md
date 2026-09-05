# Persist device settings and TODO state

Status: resolved
Blocked by: 02

## Goal

Make device configuration and TODO state survive reboot, sleep, and interrupted writes.

## Scope

- Replace static TODO strings with owned text and stable IDs.
- Define versioned `DeviceConfig` and TODO snapshot schemas.
- Persist compact blobs in NVS with validation, migration, and safe defaults.
- Keep Wi-Fi passwords write-only and absent from logs/read responses.
- Debounce semantic writes and never persist from the display worker.

## Acceptance criteria

- TODO snapshot, page index, device name, Wi-Fi settings, timezone, and sleep timeout survive reboot; no task-action or row-selection state is persisted.
- Corrupt or unsupported data produces an explicit recovery state without boot loops.
- Unit tests cover migration, truncation, invalid fields, interrupted/corrupt data, and secret redaction.

## Comments

- 2026-09-04: Versioned dual-slot NVS persistence, validation, migrations, debounced writes, stable IDs, and secret redaction are implemented and host-tested.
