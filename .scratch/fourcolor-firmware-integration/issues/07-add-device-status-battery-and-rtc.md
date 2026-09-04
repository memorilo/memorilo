# Add device status, battery, charging, and RTC services

Status: resolved
Blocked by: 01, 04, 06

## Goal

Expose trustworthy low-frequency device status that complements the TODO workflow without causing periodic full refreshes.

## Scope

- Validate battery ADC, charging/full GPIOs, and PCF8563 presence on real hardware.
- Add Rust services for battery, charging, RTC, timezone, and status snapshots.
- Render battery, charging, date, connection state, and page title only as part of an already requested frame.
- Define unset/invalid RTC and unavailable sensor states.

## Acceptance criteria

- No minute-by-minute display refresh is introduced.
- Battery readings are calibrated and bounded on hardware.
- RTC survives MCU deep sleep and invalid time is never shown as valid.
- Status services remain outside the C display component.

## Comments

- 2026-09-04: Rust battery, charging, RTC, timezone, and invalid/unset status paths are implemented; hardware accuracy remains an acceptance measurement.
