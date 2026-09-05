# Specify the BLE provisioning protocol

Status: resolved
Blocked by: 06

## Goal

Freeze the cross-platform protocol used by Memorilo to pair with and configure the device.

## Scope

- Define stable service and characteristic UUIDs for device info, redacted configuration, configuration apply, and status notifications.
- Define versioned JSON envelopes, chunk framing, request IDs, revisions, bounds, checksums, errors, and timeouts.
- Include an optional TODO-sync patch for HTTPS URL, device read token, MQTT notification settings, enable flag, interval, and view; the patch carries no TODO items or task actions.
- Require LE Secure Connections, MITM protection, bonding, and authenticated characteristics.
- Require physical entry into a time-limited configuration mode.

## Acceptance criteria

- Protocol test vectors are shared by TypeScript and Rust tests.
- Passwords and future secrets are write-only.
- Old revisions cannot overwrite newer configuration.
- Unknown optional fields are forward compatible; unsupported required versions fail explicitly.

## Comments

- 2026-09-04: Versioned UUID/envelope/framing/revision/checksum/bounds/error contract and shared Rust/TypeScript vectors are published and tested.
