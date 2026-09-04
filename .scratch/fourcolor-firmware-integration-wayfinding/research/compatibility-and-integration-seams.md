# Compatibility and integration seams

## Scope and decision rule

This assessment compares the current Rust firmware with
`LazyYoun/youn-ink-fourcolor-firmware` at commit
[`51812e4ab3fa80ba7a5a5a274635ca2cf3901a25`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/tree/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25).
It asks which upstream capabilities improve the current offline TODO workflow without
replacing the Rust application architecture or the retained C panel-driver boundary.

Verdicts mean:

- **Adopt**: make the capability part of the integration plan with its present product
  purpose, while implementing it at the downstream seam described here.
- **Adapt**: keep the idea or selected algorithm, but redesign its API, ownership, or
  interaction policy for the Rust firmware.
- **Defer**: technically credible, but blocked by product scope, missing foundations, or
  unmeasured resource cost.
- **Reject**: do not use the upstream implementation or claim as a basis for this product.
  A separately designed future feature is not ruled out unless stated.

## Executive decision

The hardware is compatible enough for selective adoption: both codebases target an
ESP32-S3 with 16 MB flash, octal PSRAM, the same 400×300 SSD2683 four-color panel, and the
same three primary buttons. The upstream board configuration also identifies battery,
charging, RTC, NFC, and audio peripherals on that board
([upstream board configuration](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/config.h#L6-L62),
[current driver provenance](../../../apps/note4c-firmware/components/zectrix_note4c_epd/UPSTREAM.md)).

The right route is not a C++ firmware transplant. Preserve these downstream invariants:

1. Rust owns the TODO data, navigation state, settings, services, and render policy.
2. One display task owns the opaque C handle; feature code never calls the panel directly.
3. Button input remains accepted while a 20–25 second refresh is in flight, and queued
   render work continues to coalesce to the latest state.
4. Full four-color refresh remains the only supported panel mode until a distinct
   monochrome/partial mode is proven on hardware.
5. Network services are not introduced through open APs, fixed credentials, or
   unauthenticated mutation endpoints.

The best combined product is therefore a TODO-first device with richer three-button
navigation, an occasional status header, local persistence, a settings/power lifecycle,
and optional low-frequency calendar/progress views. Photo management, networking,
content feeds, BLE, and audio should not enter the first integration plan.

## Shared hardware and architectural baseline

The current firmware already uses the upstream panel pinout, 40 MHz SPI mode 0, 2bpp
wire format, active-low BUSY handling, and panel power/deep-sleep sequence. These are the
only upstream application-adjacent code presently retained in C
([provenance](../../../apps/note4c-firmware/components/zectrix_note4c_epd/UPSTREAM.md),
[C driver](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L85)).
The board buttons also match: GPIO39, GPIO0, and GPIO18
([current board](../../../apps/note4c-firmware/src/board.rs#L10),
[upstream board integration](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L465)).

The principal incompatibility is application control flow. Upstream runs display work on
a task but locks navigation until the refresh-idle callback; downstream intentionally
accepts input and coalesces one pending refresh while the display task blocks
([upstream refresh lock](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L829-L849),
[downstream scheduler](../../../apps/note4c-firmware/src/main.rs#L47)). Importing the
upstream UI manager would therefore regress an already validated interaction property.

Resource headroom is plausible but not established. Downstream uses one 30,000-byte frame
and requests a 64 KiB display-thread stack; upstream's display object keeps roughly 90 KB
of frame snapshots before considering Wi-Fi, HTTP, audio, or renderer allocations
([downstream display task](../../../apps/note4c-firmware/src/main.rs#L93),
[upstream display buffers](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.h#L91-L165)).
No downstream heap watermark, stack high-water mark, binary-size budget, or current draw
has been recorded, so every service-bearing feature needs measurement before rollout.

## Foundation capabilities

| Capability | Hardware fit and TODO value | Ownership and dependencies | Main risks and refresh interaction | Verdict |
| --- | --- | --- | --- | --- |
| Contextual button commands, long press, and chords | Exact same three buttons. Long press and UP+DOWN give a credible way to open settings, switch views, or perform a secondary TODO action without adding hardware. Upstream already recognizes click, long press, and an UP+DOWN combination, although double-click types are not wired on the board ([button setup](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L465)). | Rust: convert debounced GPIO levels into `Press`, `LongPress`, `Chord`, and contextual commands, then mutate application/view state. No C or new runtime dependency is required. | Gesture recognition must not wait on display completion. Avoid double-click initially because it delays single-click dispatch and gives no immediate e-paper feedback. Add host tests for timing and precedence. | **Adopt the capability; adapt the event model in Rust.** Do not copy the upstream callback graph. |
| Application page/router and settings shell | A small TODO/settings/dashboard page model fits the existing buttons and makes sleep timeout, status visibility, and diagnostics configurable. Upstream's normal route proves gallery/settings/AP switching, but many declared pages are unreachable ([page IDs and routing](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L647-L854)). | Rust application snapshot: `Page`, focus/selection, settings, and command routing. Render each page through the pure Rust `state -> framebuffer` seam ([current renderer](../../../apps/note4c-firmware/src/ui.rs#L83)). | Every page transition may cost a full refresh. Prefer a shallow hierarchy, preserve selection across refreshes, and coalesce rapid navigation. | **Adopt**, starting with TODO and settings; calendar/progress can plug into the same shell later. |
| Async refresh worker and latest-state coalescing | Already implemented downstream and more suitable than upstream's refresh-time input lock. It is essential to the current TODO interaction. | Keep one Rust display owner and capacity-one render intent. C remains responsible only for panel commands and BUSY waits ([bridge API](../../../apps/note4c-firmware/components/zectrix_note4c_epd/include/note4c_epd_bridge.h#L7)). | An in-flight full refresh is still uninterruptible, so visible state can trail input by one or two full refreshes. Do not add upstream's three-frame snapshot allocation or UI lock merely to gain diffing. | **Adopt the downstream design; reject the upstream lock policy.** Later enrich the queue with intent/status, not concurrent display calls. |
| Battery, charging, date/time, and compact status header | Board support appears present and a low-frequency status header helps a TODO device answer whether it is charged, current, and offline. Upstream displays Wi-Fi/server/battery/charging/time/date/title ([status model](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.h#L82-L101)). | Rust board/service modules own ADC and charging GPIO reads, a clock snapshot, and a semantic status model. Use ESP-IDF HAL/service APIs; add an explicit Rust HAL dependency if needed. The panel driver needs no change. | Battery ADC calibration and pin behavior need device validation. A minute clock would cause unacceptable full refresh frequency; upstream disables minute repaint for this reason ([clock policy](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L30-L35)). Wi-Fi icons must not appear before Wi-Fi exists. | **Adapt.** First show battery/charging and date only when another user- or wake-triggered render occurs; no periodic minute refresh. |
| LED feedback policy | Same active-low status LED. The current firmware already satisfies the user's key requirement by holding it off; upstream pulses for activity and indicates charging/full state ([upstream LED policy](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/board_power_bsp.cc#L8-L65), [current output setup](../../../apps/note4c-firmware/src/board.rs#L38)). | Rust board/power policy. No C dependency. | Continuous charging/full illumination would violate the established preference and consume power. Activity pulses can be missed or visually distracting. | **Adapt narrowly:** remain off by default; at most use short, explicit error/acknowledgement pulses after validation. Do not copy the always-on/full-charge behavior. |
| Local TODO/settings persistence | The 16 MB flash is compatible. Persistence makes completion state and user settings survive sleep/reboot, directly improving the TODO workflow. Upstream proves NVS-backed credentials/settings and SPIFFS-backed indexed assets, not TODO persistence ([photo storage](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/photo_storage.h#L19-L120)). | Rust first: change static strings to owned strings and add stable TODO IDs; expose a small repository/service interface. Use NVS for compact settings and, initially, a bounded serialized TODO snapshot. A filesystem is justified only if data or history outgrows NVS. | Flash wear, interrupted-write recovery, schema migration, corrupt-data fallback, and partition sizing. Persist after semantic changes with debounce/batching, never from the display task. Security is physical-device local unless sensitive data is later introduced. | **Adopt the product capability; adapt the storage pattern.** Do not copy `PhotoStorage` or its SPIFFS index into the TODO domain. |
| Inactivity timeout, sleep blockers, and MCU deep sleep | Same ESP32 and BOOT/GPIO0 wake path. This materially improves an e-paper TODO device because the current MCU polls every 20 ms forever even though the panel is already powered down after refresh. Upstream coordinates inactivity, manual sleep, blockers, panel sleep, rail-off, and GPIO0 wake ([sleep flow](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L431-L529), [sleep manager](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/sleep_manager.cc#L34-L119)). | Rust owns lifecycle state, inactivity timestamps, blocker leases, persistence-before-sleep, and ESP-IDF wake setup. The existing C refresh already powers off and deep-sleeps the panel; add C API only if a separately reachable panel-sleep operation is proven necessary. | Must not cut power during an in-flight refresh or pending persistence write. Wake polarity, GPIO hold state, battery latch behavior, boot latency, and stale time need hardware tests. Long-lived network/audio blockers would erase the power benefit. | **Adopt, adapted in Rust.** Make this a foundation before any radio or scheduled service. |
| Rich text, Unicode fonts, wrapping, viewport, and reusable widgets | High TODO value: current glyphs are a tiny uppercase set, and longer or Chinese task text cannot render. Upstream's RawDraw layer and ebook renderer demonstrate UTF-8 wrapping, paging, icons, dialogs, and list layouts ([ebook wrapping/paging](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ebook_renderer.cc#L128-L190)). | Rust rendering/layout above the current packed framebuffer. Add embedded bitmap font assets, glyph lookup, measured text layout, clipping, pagination, and semantic widgets. C remains untouched. | Full CJK fonts can consume substantial flash; decompression/caches consume RAM. Wrapping changes page count and selection mapping. Rendering time is small relative to panel refresh but should not hold the model lock. | **Adopt the capability; adapt/reimplement in Rust.** Reuse visual rules and test cases, not the C++ renderer object graph. |
| Lightweight diagnostics | Color bars already exist downstream. Upstream factory tests demonstrate checks for buttons, battery, panel, audio, RTC, and NFC, but factory mode is outside its normal product path ([factory-related board access](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L286-L311)). | Rust diagnostics page plus existing build variants. Only a device-specific peripheral test may call a narrow Rust HAL adapter. | A hidden diagnostic route must not be entered accidentally; repeated color tests consume time/power. Do not initialize unused audio/NFC just to report them. | **Adapt:** retain color test and add only battery/button/build/resource diagnostics that support planned features. Reject wholesale factory-test import. |

## Optional content and connectivity capabilities

| Capability | Hardware fit and possible combination with TODO | Ownership and dependencies | Main risks and refresh interaction | Verdict |
| --- | --- | --- | --- | --- |
| Calendar and year-progress views | Pure calculations fit the hardware and can complement TODO due-date context as secondary pages. Upstream renderers are largely self-contained; calendar also includes lunar-date navigation ([calendar](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/calendar_renderer.cc#L52-L80)). | Rust page state and pure date calculations. Requires a reliable clock/date source and richer font/layout foundation. | Daily refresh is acceptable; minute or animation-like updates are not. Lunar/almanac calculations require correctness tests and locale decisions. | **Adapt after the foundations.** Prefer Gregorian calendar and year progress first; do not make this a broader organizer domain yet. |
| RTC-backed time | Upstream initializes a PCF8563 on the same board, so hardware fit is credible. It can keep dates meaningful across Wi-Fi-free deep sleep and support real due dates later ([RTC initialization](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L163-L174)). | Rust I²C/RTC service; keep it outside the panel C component. Requires explicit I²C ownership and a time-setting policy. | Device revision and RTC presence should be probed; invalid/unset RTC, timezone, and battery-backed drift need UI states. Current TODO `due` values are presentation strings, not dates. | **Defer**, then adapt when the model gains typed dates or calendar is selected. |
| Wi-Fi provisioning and SNTP | ESP32-S3 and current `esp-idf-svc` stack can support it. It could set the clock and later enable sync, but server/sync work is explicitly outside this effort. Upstream opens provisioning when credentials are absent and supports a long-press reset path ([provisioning path](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L105-L158)). | Rust network service and credential repository using ESP-IDF Wi-Fi/NVS/SNTP APIs. Requires a connection state machine, timeout/cancellation, and integration with sleep blockers. | Radio power, heap/task cost, reconnect behavior, credential reset UX, and full-refresh-only status feedback. Upstream's provisioning AP has no password; that default is unacceptable. | **Defer.** If later selected, adapt the state machine in Rust and require a secure provisioning design. |
| Local HTTP management | Technically supported and could eventually manage TODOs from a phone on a trusted LAN. Upstream already serves CRUD/control endpoints and a browser UI ([HTTP handlers](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ap_transfer_server.cc#L344-L653)). | Rust application service over ESP-IDF HTTP server; commands enter the same model/repository boundary as buttons. Needs Wi-Fi, lifecycle ownership, authentication/authorization, request limits, and concurrency policy. | Upstream is plaintext and unauthenticated, with fixed AP credentials for transfer mode; it can mutate content and control power. Running the service also blocks sleep. Concurrent button/HTTP mutations need serialization and conflict rules. | **Reject upstream as-is; defer the capability** until server/connectivity scope is reopened and a security boundary is specified. |
| Photo gallery, raw asset storage, browser-side conversion, and slideshow | Panel/storage fit is proven: upstream stores up to 50 exact 400×300 1bpp/2bpp images, and the browser performs resize/quantization before upload ([photo formats](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/photo_storage.h#L19-L120), [browser conversion/API](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ap_transfer_server.cc#L344-L545)). It has weak TODO synergy beyond an optional focus image or idle frame. | If ever selected, keep metadata/page state in Rust, raw packed images in a filesystem partition, and conversion in the browser/desktop companion. The existing C driver can consume the same 30,000-byte format. | Needs a custom partition table, storage recovery, upload security, and another product navigation mode. Slideshow prevents sleep upstream and each image costs a full refresh. | **Defer.** Reuse the client-side conversion and exact raw-format concepts later; do not add gallery storage to the TODO model now. |
| Weather and news | Hardware can run the clients, but upstream modules are compiled without a product data-injection path. They add little to the offline TODO core except an optional glance page ([weather API/renderer](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/weather_api.cc#L313-L363), [news renderer](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/news_renderer.cc#L98-L169)). | Rust fetch/cache services and pure renderers. Requires Wi-Fi, TLS trust/time, endpoint contracts, retries, caching, and localization/font support. | Network security/privacy, API reliability, RAM, radio power, stale data, and refresh frequency. News navigation is especially poor under 20–25 second full refreshes. | **Defer.** Do not treat compiled upstream modules as finished reusable features. |
| Ebook reader | Text storage and paging fit flash/PSRAM, and upstream has wrapping/paging logic, but it does not share the TODO domain or an import workflow ([ebook renderer](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ebook_renderer.cc#L320-L373)). | Rust storage/page model and Rust text layout. Requires font support, file import, encoding limits, and a filesystem partition. | Each page turn costs a full refresh; storage parsing and very large files need bounds. It broadens the product from task appliance to reader. | **Defer outside the TODO-first rollout.** Reuse wrapping/pagination concepts in the TODO viewport, not the reader implementation. |
| Almanac and life bar | Pure renderers fit, but the almanac is a simplified lookup and life bar hard-codes a birth date and lifespan ([almanac](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/almanac_renderer.cc#L117-L138), [life bar](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/lifebar_renderer.cc#L30-L60)). | Would be Rust page calculations plus persisted user/profile data. | Questionable correctness/value, localization burden, and unnecessary personal data. | **Reject for this product plan.** Year progress captures the useful glanceable-progress idea without these liabilities. |

## Capabilities to reject as upstream integration bases

| Capability | Compatibility assessment | Verdict |
| --- | --- | --- |
| Four-color partial refresh and upstream dirty-region machinery | Upstream computes diffs and dirty regions but explicitly forces every four-color update to a full refresh; the machinery applies to its 1bpp path, not a demonstrated four-color partial waveform ([refresh policy](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L444-L665), [forced full refresh](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L993-L1015)). Downstream's C bridge exposes only full-frame refresh. | **Reject as evidence or copyable solution.** Keep full four-color refresh. A future fast monochrome/partial experiment must be a separate hardware-validation effort and, if successful, a narrow typed Rust refresh intent plus C driver operation. |
| BLE image push | The module is not initialized and accepts only a 15,000-byte 1bpp frame, not the current four-color format ([BLE limits](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ble_image_receiver.h#L1-L18)). BLE task/heap cost and pairing/authentication are also unresolved. | **Reject the implementation.** If phone-to-device TODO transfer becomes a goal, design a small authenticated TODO protocol rather than repurposing the image receiver. |
| Audio, voice, and chat | Board audio hardware exists, but upstream starts multiple audio/Opus tasks, including a 26 KB codec-task stack, while the assistant server callbacks and TTS stream are incomplete ([audio service](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/audio/audio_service.cc#L22-L104), [unfinished stream](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/streaming/stream_pipeline.cc#L150-L163)). It would add the largest RAM, power, server, privacy, and UX burden with weak TODO value. | **Reject from this integration plan.** Do not initialize the audio rail or tasks. Voice capture can only return as a separately scoped, measured feature with a defined service/privacy model. |
| NFC | Upstream exposes the hardware mainly to factory tests, with no end-user workflow ([board peripheral use](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L286-L311)). It does not improve current TODO navigation or persistence. | **Reject for this plan.** Do not add a C peripheral layer merely because the chip is present. |
| OTA | The README advertises OTA-related APIs, but the named backend and service files are absent at the pinned revision; there is no implementation to assess ([README claim](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/README.md#L153-L183), [server tree](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/tree/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/server)). Secure OTA would also require partition, signature, rollback, power-failure, and update-authentication decisions. | **Reject the upstream claim as evidence.** Treat any future OTA work as an independent security-sensitive project. |
| Legacy TODO page | The upstream page is old LVGL source, is not built, and only stores `{text, completed}` with no persistence, buttons, or sync ([TODO header](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/pages/todo_page.h#L10-L44), [component sources](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/CMakeLists.txt#L1-L87)). The downstream Rust model, renderer, buttons, and asynchronous scheduler are already a stronger base. | **Reject.** Keep and evolve the Rust TODO domain. |

## Correct ownership by seam

| Seam | Rust responsibility | Retained C responsibility |
| --- | --- | --- |
| Domain snapshot | Owned TODO strings, stable IDs, status/due-date semantics, page state, settings, persisted-schema version | None |
| Input | GPIO sampling/debounce, gesture recognition, contextual commands, wake/inactivity accounting | None |
| Services | Persistence, clock/RTC, battery readings, Wi-Fi/network state if later selected, sleep blockers, error mapping | None |
| Rendering | Fonts, layout, widgets, status bar, page renderers, packed 2bpp framebuffer, refresh intent | None |
| Display scheduling | Single owner, capacity-one latest-state queue, busy/error status, future refresh-mode policy | Execute only supported SSD2683 command sequences and BUSY/power timing |
| Power | MCU sleep/wake policy, battery latch policy, persistence-before-sleep | Panel reset/power/deep-sleep sequence; only add a narrow operation when Rust cannot express it safely |

This keeps the current safety invariant behind `unsafe impl Send`: the opaque display is
owned by one task and never accessed concurrently
([Rust display wrapper](../../../apps/note4c-firmware/src/display.rs#L13)). It also avoids
turning the retained panel component into a second application framework.

## Reusable concepts versus copyable code

The upstream repository is MIT-licensed, so code can be reused with its license notice,
but legal copyability is not architectural suitability. The following distinction should
govern implementation:

**Reusable concepts and evidence**

- verified pin mappings, SSD2683 timings, packed pixel values, power sequencing, and the
  board's peripheral inventory;
- long-press/chord interaction vocabulary, settings/page composition, sleep blockers,
  inactivity sleep, and low-frequency status presentation;
- browser-side image conversion, bounded raw asset formats, text wrapping/pagination,
  and calendar/year-progress calculations;
- the negative evidence that four-color partial refresh is not implemented, refresh-time
  input locking is undesirable, and several compiled modules are not product-ready.

**Code that is reasonable to copy or mechanically port**

- the already retained, licensed narrow SSD2683 C sequence and verified board constants;
- small pure tables/algorithms such as glyph metadata or date calculations, only after
  validating correctness, preserving attribution, and wrapping them in Rust tests;
- browser-side conversion code only if a future companion upload feature is approved,
  because that code remains in the browser rather than crossing the Rust/C firmware seam.

**Code not to copy into the current architecture**

- `Application`, `RawDrawUiManager`, renderer class hierarchy, callback wiring, or its
  input-refresh lock;
- `PhotoStorage` as a TODO repository, the open/fixed-credential provisioning and HTTP
  server, or the three-frame display snapshot design;
- dormant weather/news/ebook/BLE modules, factory-test plumbing, legacy LVGL TODO page,
  audio/voice task graph, or README-only OTA/backend claims.

## Dependencies and gates before implementation planning

No selected foundation requires replacing the C driver or adding a broader domain than a
flat TODO list. The model does need owned text, stable IDs, and explicit view/settings
state before persistence and page navigation.

The staged plan should require these gates:

1. Record release binary size, free internal heap/PSRAM, display-task stack watermark, and
   awake/refresh/deep-sleep current before and after each service-bearing stage.
2. Preserve host tests for model, command routing, persistence recovery, text layout, and
   render determinism; use the documented ESP-IDF build/flash path for GPIO, ADC, I²C,
   sleep/wake, and display acceptance tests
   ([device workflow](../../../docs/agents/esp-idf-flashing.md)).
3. Keep full four-color refresh as the acceptance baseline: input remains accepted during
   refresh, intermediate requests coalesce, and no feature performs periodic minute-level
   refreshes.
4. Require local persistence and clean sleep/wake before adding Wi-Fi or an always-listening
   service. Require an explicit authentication and threat model before exposing mutation
   over HTTP, BLE, or OTA.
5. Add filesystem partitions only when a selected feature cannot fit the bounded NVS
   design; do not reserve gallery or OTA partitions speculatively.

## Bottom line

The upstream firmware contributes proven board knowledge and several useful product
patterns, but little application code should cross directly into the Rust firmware. The
compatible integration spine is: richer Rust commands and page state → owned/persisted
TODO snapshot → Rust fonts/layout/status → explicit Rust power lifecycle → optional
calendar/progress pages. Preserve the existing asynchronous latest-state refresh design
and narrow C display boundary. Defer all radio/content services until that spine is
measured and stable, and reject upstream implementations that are insecure, unreachable,
incomplete, or falsely imply four-color partial refresh.
