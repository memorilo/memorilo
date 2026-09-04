# Create the Rust application orchestrator

Status: resolved
Blocked by: 01

## Goal

Introduce a Rust-owned `Application` that replaces the current ad hoc startup loop and becomes the single owner of lifecycle, pages, commands, services, and render intents.

## Scope

- Define application snapshot, page identity, command routing, service handles, and lifecycle states.
- Keep model mutation independent of physical display completion.
- Provide scoped startup and shutdown for display, persistence, provisioning, networking, and future services.
- Keep the retained panel handle confined to the display subsystem.

## Acceptance criteria

- The existing fake TODO screen and three basic button actions run through `Application`.
- Application state can be unit tested without ESP-IDF hardware.
- No application feature calls the C panel bridge directly.

## Comments

- 2026-09-04: Rust Application owns lifecycle, pages, commands, snapshots, and render intents; host lifecycle/page tests pass.

## Comments

- 2026-09-03: Implemented the Rust-owned `Application`, routed fake TODO and
  button commands through it, and verified the formal application on the
  physical device. The first-frame boot failure was caused by an effective
  3584-byte ESP main-task stack; restoring 10000 bytes allowed the Memorilo UI
  to replace the retained color-test image.
