# Firmware resource and power baseline

Measured on 2026-09-03 (Asia/Shanghai) on the connected ESP32-S3 N16R8 target.

## Build identity

| Field | Value |
| --- | --- |
| Git revision | `ecb96fb51fb48d8904dc1dad326a7f11484452db` plus the uncommitted diagnostic changes described by this report |
| Cargo profile | `release` |
| Cargo features | `--no-default-features --features real-display` |
| Rust target | `xtensa-esp32s3-espidf` |
| ESP-IDF | `v5.5.2` |
| Application image | 474,592 bytes |
| Application SHA-256 | `14d8af368a3502555d864c46fb82a8e9ae75f1b0d0b5d698d734107f504714d5` |
| ELF size | 808,220 bytes |
| Flash | 16 MB, DIO, 80 MHz |
| PSRAM | 8 MB octal, 40 MHz |

The application image was generated and validated by `esptool 5.4.0`, then
written to `COM3` with the repository's canonical flash script. Bootloader,
partition table, and application hashes were verified after writing.

## Runtime measurements

All memory and stack values are bytes. The task stack high-water mark is the
minimum unused stack observed for the task up to that point.

| Event | Uptime | Free heap | Minimum free heap | Free internal | Minimum free internal | Free PSRAM | Minimum free PSRAM | Task stack high-water |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Main boot start | 41 ms | 8,726,024 | 8,726,024 | 371,899 | 371,899 | 8,386,156 | 8,386,156 | 1,928 |
| Hardware ready | 73 ms | 8,723,856 | 8,723,856 | 369,731 | 369,731 | 8,386,156 | 8,386,156 | 1,880 |
| Main UI loop ready | 101 ms | 8,626,240 | 8,626,224 | 302,311 | 302,291 | 8,355,944 | 8,355,944 | 1,768 |
| Display refresh start | 107 ms | 8,626,116 | 8,626,116 | 302,203 | 302,203 | 8,355,944 | 8,355,944 | 63,872 |
| Display refresh end | 24,521 ms | 8,626,036 | 8,625,932 | 302,123 | 302,019 | 8,355,944 | 8,355,944 | 63,056 |

The first physical refresh took 24,358 ms. The application-relative first
completed frame timestamp was 24,509 ms. The ESP-IDF serial timestamps put the
first completed frame at 25,557 ms after reset, including approximately 1.1
seconds of bootloader, PSRAM initialization, and runtime startup.

No persistent heap loss was visible across this single baseline refresh beyond
the 80-byte difference between the refresh-start and refresh-end snapshots.
Future tickets should compare the same `ui_loop_ready`, `refresh_start`, and
`refresh_end` records and preserve positive stack margin for both tasks.

## Reproduction

From `apps/note4c-firmware`:

```powershell
cargo +stable test --target x86_64-pc-windows-msvc
.\tools\flash-firmware.ps1 -Port COM3 -Variant real -WhatIf
.\tools\measure-firmware.ps1 -Variant real
.\tools\flash-firmware.ps1 -Port COM3 -Variant real -SkipBuild
.\tools\monitor-firmware.ps1 -Port COM3
```

Reset once from the ESP-IDF monitor and capture every line containing `DIAG`.
The firmware reports boot milestones, heap and PSRAM minima, the current task's
stack high-water mark, refresh duration, and first-frame completion time.

The scripts now default to `C:\tmp\mf`; the previous temporary-directory default
exceeded the `esp-idf-sys` ten-character Windows build-path limit.

## Pending current measurements

No USB power meter, ammeter, or board current-sense interface is available to
the host, so current cannot be derived from the serial diagnostics. Measure at
the device supply input using a meter that does not disrupt USB serial:

1. Record stable idle current for at least 30 seconds before a refresh.
2. Trigger one TODO-state refresh and record average and peak current across the
   approximately 24.4-second physical refresh.
3. Record stable post-refresh current for at least 30 seconds after panel power
   has been disabled.
4. Note supply voltage, whether the battery is connected or charging, and the
   meter model alongside the readings.

These three current readings remain the only unmet acceptance item for ticket
01.
