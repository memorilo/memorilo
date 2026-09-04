# Design and implement secure OTA

Status: ready-for-human
Blocked by: 01, 06, 08, 13

## Goal

Provide a real secure update lifecycle rather than relying on the upstream README-only OTA claim.

## Missing decisions

- Update authority, release channel, signing-key custody, and revocation policy.
- Direct internet, local Memorilo-assisted, or server-assisted delivery.
- Partition layout, rollback threshold, downgrade policy, and recovery UX.

## Required acceptance direction

- Images are cryptographically verified before activation.
- Interrupted or invalid updates retain a bootable image and roll back automatically.
- OTA cannot begin below a defined power threshold or during conflicting device work.
- Update progress does not require frequent e-paper refreshes.

## Decision

Use a Memorilo-assisted HTTPS delivery path with signed ESP-IDF images and an
ESP32-S3 factory/OTA-0/OTA-1 layout. The release key stays in CI/HSM custody;
the device embeds a rotating public-key set and rejects revoked keys,
downgrades, invalid signatures, and images outside the declared board/size
constraints. Download, signature verification, and boot-health confirmation
run under an expiring power/storage lease. The bootloader selects the previous
slot after a bounded failed-boot count, so interruption leaves a bootable image.
Only coarse progress events are logged/rendered; no periodic e-paper animation.
Before implementation, the human owner must approve key custody/rotation,
rollback count, partition migration, and the release-channel authority.
