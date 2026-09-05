# Add gallery, image storage, and browser-side conversion

Status: ready-for-human
Blocked by: 04, 06, 08, 13

## Goal

Add the proven upstream photo workflow on the official `assets` storage contract as a separate application feature without coupling it to the TODO model.

## Scope

- Use the official approximately 8 MiB SPIFFS `assets` partition and a versioned image index.
- Store exact 400x300 2bpp BWRY assets with metadata and recovery behavior.
- Add gallery, full-screen image, delete/reorder, and optional slideshow pages.
- Perform resize and BWRY quantization in the Memorilo/browser client before upload.
- Ensure slideshow policy does not permanently prevent sleep.

## Acceptance criteria

- Corrupt/missing assets do not break boot or the TODO workflow.
- Uploads are authenticated, size checked, and committed safely.
- Displayed raw assets use the existing verified full-frame path.
- Storage limits, refresh cost, and slideshow power policy are visible to the user.
- Upgrades may clear the legacy custom gallery area but preserve TODO, Wi-Fi, BLE, and device configuration.

## Comments

- 2026-09-04: Software path, partition-aware build, authenticated API, browser
  conversion, and focused tests are complete. Physical partition recovery and
  on-device LAN upload still require COM3 and a real NOTE4C test run.

## Comments

- 2026-09-04: Added the first storage/conversion slice. Firmware now has a 4 MiB `gallery` data partition, dual 32 KiB generation-index slots, 100 fixed 32 KiB image slots, exact 400×300 2bpp BWRY validation, checksums, missing/corrupt asset quarantine, safe insert/delete/reorder behavior, and a five-minute minimum slideshow interval that does not create a permanent sleep blocker. The ESP32-S3 release image is 1,755,264 bytes and passes the canonical partition-aware `flash-firmware.ps1 -WhatIf` build.
- 2026-09-04: Added browser-side contain/cover resize support and serpentine Floyd–Steinberg quantization into the firmware's black/white/yellow/red packed layout. Six focused browser tests cover all palette encodings, alpha compositing, output size, and physical dimensions. Upload endpoints, gallery/full-screen device pages, desktop preview/upload UI, and physical partition recovery remain pending.
- 2026-09-04: Completed the software path end to end. Authenticated HTTP now exposes bounded gallery metadata plus exact-frame upload, delete, reorder, and slideshow mutations; every mutation is serialized on the application main loop and publishes a revision/error result without letting flash failures stop TODO, input, or display services. The device now cycles Todo → Gallery → Settings, shows the LAN address and storage/refresh policy, uses the verified raw full-frame path for images, keeps navigation active during refresh, and advances an enabled slideshow only while its full-screen page is awake.
- 2026-09-04: Memorilo Device settings now keeps the Bearer token exclusively in Electron main, restricts management requests to literal private/link-local IPv4 targets, rejects redirects, converts contain/cover images into an exact four-color preview, and supports upload progress, delete confirmation, reorder, capacity, refresh cost, and slideshow controls. Firmware host tests pass 65/65; focused renderer/preload/main tests pass 13/13, 7/7, and 9/9; affected lint/typecheck pass. The canonical real-target dry run produced a verified 1,777,840-byte image with validation hash `edc0fc1c0bb375267901a79bb5b19f7882aa30ad987c5ddb99a8f44e8760c7c4` in the 3 MiB factory partition. Physical partition recovery and on-device LAN upload remain pending until COM3 is available, so the ticket stays claimed.

- 2026-09-04: The partition table now follows the upstream-compatible
  `assets` SPIFFS layout (`0x800000`, `8M`). The old custom `gallery` region is
  intentionally not migrated; a freshly flashed device starts with an empty
  assets catalog. The Rust fixed-frame repository continues to use the
  partition label and remains bounded to 100 exact 400×300 BWRY frames.
