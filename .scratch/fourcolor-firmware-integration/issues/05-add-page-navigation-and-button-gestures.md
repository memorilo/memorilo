# Add page navigation and button gestures

Status: resolved
Blocked by: 02, 04

## Goal

Allow the three physical buttons to navigate read-only content pages and enter configuration pairing without waiting for display refresh completion.

## Scope

- Add press, release, long-press, repeat, and UP+DOWN chord recognition in Rust.
- Map raw gestures to contextual application commands.
- Long-press UP/DOWN to move to the previous/next content page.
- Keep TODO read-only and omit device Settings from the normal page loop.
- Reserve UP+DOWN long press for BLE configuration mode.
- Avoid double-click initially because it delays single-click feedback.

## Acceptance criteria

- Gesture precedence and timing are host tested with a fake clock.
- A held or chorded button emits one intended command rather than repeated accidental actions.
- Page navigation remains accepted during an in-flight display refresh.

## Comments

- 2026-09-04: Rust gesture recognition and contextual page routing are implemented; host timing/precedence tests pass.
- 2026-09-04: Removed the device Settings page and all device-side TODO mutations. Long-press UP/DOWN now traverses the seven content pages; UP+DOWN enters a dedicated BLE pairing status page.
