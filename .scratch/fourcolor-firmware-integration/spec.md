# Multifunction device firmware integration

## Goal

Evolve the existing embedded TODO prototype into a multifunction Rust + ESP-IDF application informed by `LazyYoun/youn-ink-fourcolor-firmware`, while retaining the verified low-level C SSD2683 command sequence until a separate driver-replacement decision is made.

## Architecture

- Rust `Application` owns lifecycle, page routing, services, settings, and domain state.
- Rust `RawDrawUiManager` owns semantic widgets, Unicode text layout, pages, and packed BWRY framebuffer rendering.
- Rust `CustomLcdDisplay` owns frame comparison, dirty-region analysis, refresh debounce, tiny-change deferral, latest-frame coalescing, and the single display worker.
- The retained C component owns SSD2683 commands, BUSY timing, SPI, panel power, and panel sleep.
- Button input remains active during a physical refresh. Intermediate frames may be discarded, but accepted user actions may not be discarded.
- An identical framebuffer is never refreshed. Small changes are delayed and merged. Four-color physical output remains full refresh unless a separate hardware-validation effort proves another mode.

## Included capabilities

- Read-only bounded TODO projection synchronized from Memorilo and cached locally for offline display.
- Contextual content pages, long-press page navigation, and a separate BLE pairing status page; device settings live only in Memorilo.
- Unicode fonts, wrapping, pagination, reusable widgets, and semantic four-color styling.
- Battery/charging/time status, RTC, inactivity sleep, wake, and power coordination.
- Secure BLE pairing and device configuration from the Memorilo desktop settings page.
- Wi-Fi provisioning, trusted local management, gallery/storage/slideshow, and browser-side BWRY conversion.
- Weather, calendar, annual progress, almanac, and life-progress views.
- Audio, voice, chat, and TTS after their service/privacy contract is specified.
- NFC after an end-user workflow is specified.
- Lightweight diagnostics and measurable resource/power acceptance gates.

## Excluded capabilities

- News.
- Ebook reader.
- BLE image transfer; BLE is a short-lived provisioning/configuration channel.
- Upstream refresh-time input locking.
- Treating upstream dirty-region code as evidence of four-color physical partial refresh.

## Research inputs

- [Upstream capability inventory](../fourcolor-firmware-integration-wayfinding/research/upstream-firmware-capability-inventory.md)
- [Current firmware inventory](../fourcolor-firmware-integration-wayfinding/research/current-firmware-capabilities-and-constraints.md)
- [Compatibility and integration seams](../fourcolor-firmware-integration-wayfinding/research/compatibility-and-integration-seams.md)
