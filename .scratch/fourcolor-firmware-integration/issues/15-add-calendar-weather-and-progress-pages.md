# Add calendar, weather, and progress pages

Status: resolved
Blocked by: 04, 07, 08, 13

## Goal

Add the selected glanceable content pages while respecting the slow full-refresh display.

## Scope

- Add Gregorian calendar navigation and annual progress first.
- Add weather fetch/cache/staleness states with bounded refresh frequency.
- Add almanac and life-progress pages with explicit data sources and user-editable inputs rather than upstream hard-coded values.
- Reuse the Rust page, font, status, and command foundations.

## Acceptance criteria

- No page performs animation-like or minute-level refreshes.
- Weather remains readable offline using timestamped cached data and explicit stale/error states.
- Calendar calculations, timezone boundaries, leap years, and locale formatting are tested.
- Almanac limitations and life-progress assumptions are visible rather than presented as authoritative facts.

## Answer

Implemented the glance pages in the Rust application and RawDraw UI. Gregorian calendar navigation is bounded to +/-1200 months and uses the RTC snapshot, including leap years, timezone/date-boundary calculations, and deterministic tests. Annual progress is day-based and only changes when a normal application refresh occurs.

Weather state is modeled independently from the display and includes unavailable, loading, fresh, stale, and failed states. A timestamped cache remains readable offline; successful fetches are limited to once per hour and failures retry after a bounded 15-minute backoff. The `WeatherProvider`/`WeatherScheduler` boundary is host-tested. The current application loop runs its demo provider only when weather is enabled, Wi-Fi is online, trusted time has synchronized, and the cache is due; the resulting page is visibly labeled `DEMO DATA` so it cannot be mistaken for live conditions.

Almanac is intentionally a user-supplied note with an explicit source and a visible non-authoritative disclaimer. Life progress accepts a user birth date and expected lifespan, clamps at the configured endpoint, and is labeled as an estimate rather than a prediction. No page performs animation-like or minute-level refreshes.

## Comments

- 2026-09-04: Added weather cache/state/scheduler, calendar and life-progress boundary tests, four additional glance pages, and schema-v4 migration defaults. Firmware host tests pass (74 tests). External weather HTTP provider and desktop editing controls remain a separate integration choice; no hard-coded personal or weather claims are presented.
- 2026-09-04: Connected the explicitly labeled demo weather provider to the application loop behind enabled/online/time-synchronized/due gates. Added weather, almanac, and life-progress fields to the BLE protocol, firmware apply path, and Memorilo settings UI; documented their validation and privacy boundaries. Firmware host tests (74), provisioning tests (5), renderer type checking, and targeted lint all pass.
- 2026-09-04: Bound cached weather to its configured coordinates: changing location now invalidates the runtime and durable old reading before an immediate eligible fetch, so an offline device cannot label old-location data with the new location. Firmware tests pass 76/76, strict Clippy passes, renderer tests pass 104 Node + 52 Chromium, and the canonical ESP-IDF dry run produced a verified 1,807,520-byte image with hash `99acf3d646aeac22d90208c1ca79d4dbf897f7143d0226a5a7398030a60c092d` in the 3 MiB factory partition.
