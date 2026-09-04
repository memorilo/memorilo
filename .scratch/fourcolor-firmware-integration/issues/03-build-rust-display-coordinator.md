# Build the Rust display coordinator

Status: resolved
Blocked by: 01, 02

## Goal

Replace the capacity-one token scheduler with a Rust `CustomLcdDisplay`-style coordinator that keeps the useful upstream frame policy without inheriting its input lock.

## Scope

- Track the last physically displayed frame and the latest requested frame.
- Skip byte-identical frames.
- Calculate changed bytes/pixels, dirty bounds, and change ratio.
- Delay and merge small changes with bounded latency.
- Coalesce updates received during a refresh into the latest frame.
- Publish busy, completed, skipped, delayed, and failed events to `Application`.

## Acceptance criteria

- Input and state mutation remain active throughout a 20–25 second refresh.
- Identical frames do not call the C driver.
- Multiple small updates produce at most one delayed refresh of the latest frame.
- A completed refresh never marks a newer pending frame as displayed.
- Four-color output continues to use the verified full-refresh C operation.

## Comments

- 2026-09-04: Coordinator tests cover identical-frame suppression, delayed merge, in-flight successor coalescing, and stale completion protection.

## Verification

- Deterministic host tests with a fake display and controllable clock.
- Real-device test covering input during refresh and a queued successor frame.
