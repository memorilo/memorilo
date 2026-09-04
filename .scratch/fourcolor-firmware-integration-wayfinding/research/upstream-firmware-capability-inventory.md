# Upstream four-color firmware capability inventory

## Scope and method

This inventory examines `LazyYoun/youn-ink-fourcolor-firmware` at commit
[`51812e4ab3fa80ba7a5a5a274635ca2cf3901a25`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/tree/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25).
It distinguishes capabilities that are reachable in the normal RawDraw product path from
modules that merely compile, and from README claims that are not present at this revision.
That distinction matters because the repository contains several generations of UI and
service code at once.

## Executive answer

At the pinned revision, the dependable product is primarily an offline four-color photo
frame with three-button navigation, Wi-Fi provisioning, a device-hosted image-management
website, status indicators, and sleep/power coordination. It is not yet the complete AI
assistant and TODO-sync product described by the README.

The most mature, reusable capability clusters are:

1. persistent image storage plus browser-side four-color conversion and upload;
2. Wi-Fi provisioning and a local HTTP management surface;
3. status-bar data, battery/charging reporting, SNTP time, and coordinated deep sleep;
4. a richer three-button event vocabulary and a dedicated asynchronous display worker;
5. reusable RawDraw text/layout/widgets and several self-contained date/progress renderers.

Weather, news, ebook, chat/voice, BLE image transfer, OTA UI, RTC/NFC, and factory test code
range from substantial but disconnected modules to manufacturing-only facilities. The TODO
implementation is an old, unbuilt LVGL page with no persistence or synchronization.

## Capability status matrix

| Capability | Status at pinned revision | What actually works or exists | Important assumptions and limits |
| --- | --- | --- | --- |
| Photo gallery | **Normal path, usable** | Persistent gallery, selection, full-screen view, previous/next, delete, metadata edit/reorder, and slideshow | SPIFFS `assets` partition; maximum 50 images; exact 400×300 raw 1bpp or 2bpp payloads |
| AP/LAN image management | **Normal path, usable** | Upload, list, download, delete, metadata update, reorder, show-now, stop service/Wi-Fi, and sleep controls | Device serves unauthenticated plaintext HTTP; browser performs resize and quantization; fixed AP credentials for image-transfer mode |
| Wi-Fi provisioning | **Normal path, usable** | Open provisioning AP when no credentials exist; UP+DOWN long press re-enters configuration; STA reconnect path | NVS credentials, Wi-Fi radio, open configuration AP |
| Status bar and clock | **Normal path, usable** | Wi-Fi, local-server, battery, charging, time, date, and page title | Network time uses three fixed SNTP hosts; minute-by-minute repaint is disabled for four-color refresh cost |
| Settings | **Normal path, usable subset** | Restart, Wi-Fi toggle/configuration, local HTTP server toggle, slideshow interval, manual sleep, firmware/device information | Some renderer options and OTA structures exceed the callbacks wired by the application |
| Sleep and panel power | **Normal path, usable** | Inactivity timer, manual deep sleep, GPIO0 wake, sleep blockers, panel sleep, panel rail off | HTTP service and slideshow can deliberately keep the MCU awake; full restart after deep sleep |
| Buttons | **Normal path, usable subset** | UP/DOWN/BOOT click and long press, UP+DOWN combination | Double-click types exist, but the board does not register double-click callbacks; refresh locking suppresses navigation during a panel update |
| Four-color rendering | **Normal path, usable** | 400×300 2bpp semantic framebuffer and SSD2683 transfer | Every four-color update is forced to a full refresh; nominal diff/dirty-region machinery does not produce four-color partial updates |
| Calendar/year progress/almanac/life bar | **Renderer present, not product-reachable** | Mostly self-contained local calculations and button handlers | No normal navigation route; life bar has hard-coded 1990-01-01 birth date and 80-year lifespan; almanac “宜/忌” is a simplified table calculation |
| Weather/news | **Renderer/API modules present, not wired** | Renderers accept structured data; weather and holiday fetchers compile | No normal page route or application data injection; empty states are shown by default |
| Ebook | **Renderer present, not wired** | TXT list/reader, wrapping, paging, landscape/portrait renderer | No storage/import workflow is connected to the application path |
| Chat/voice/audio | **Substantial infrastructure, incomplete product path** | Chat bubbles, ES8311 audio, input/output and Opus tasks, recording/playback queues | No active server protocol/callback wiring in `Application`; TTS stream integration still contains TODOs; significant task stack and always-initialized board audio rail |
| BLE image push | **Compiled module, not initialized** | GATT control/data/device-info characteristics and chunk reassembly | 1bpp only, maximum 15,000 bytes; no application initialization or image-ready callback |
| RTC/NFC/factory test | **Hardware/manufacturing modules, not normal product features** | PCF8563 and GT23SC6699 initialization, broad factory test flow | Factory mode returns false in the board; NFC is only consumed by factory-test code; product clock uses system/SNTP path |
| TODO | **Legacy source only, not built** | Old LVGL page can set/add/update/remove `{text, completed}` items | Not in current CMake sources; no RawDraw renderer, input route, storage, networking, or sync |
| Python backend and complete AI/TODO service | **README claim absent at this revision** | `server/mock_client.py` is a client-side protocol simulator | The README names backend entry points and APIs that are absent from the checked-out `server/` tree |

## 1. Capabilities reachable in the normal application path

### 1.1 Photo gallery and storage

The firmware initializes photo storage and opens the gallery as its default page. Gallery
button handling and settings callbacks are bound from the main application, while page
switching in the active path is limited to gallery, settings, and AP transfer
([application.cc#L122-L364](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L122-L364),
[rawdraw_ui_manager.cc#L647-L854](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L647-L854)).

`PhotoStorage` defines a maximum of 50 photos and supports two exact raw formats: 400×300
1bpp (15,000 bytes) and four-color BWRY 2bpp (30,000 bytes). It persists content and an
index under the `assets` filesystem, including title, description, favorite flag, and sort
order. The API supports save, load, delete, metadata update, and reorder
([photo_storage.h#L19-L120](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/photo_storage.h#L19-L120),
[photo_storage.cc#L390-L516](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/photo_storage.cc#L390-L516)).
The 16 MB partition table gives `assets` 8 MB of SPIFFS space
([16m.csv#L1-L8](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/partitions/v2/16m.csv#L1-L8)).

The gallery UI implements browsing, direct view, delete confirmation, and metadata-related
operations. Slideshow intervals of 5, 10, and 30 minutes are exposed and scheduled by the
UI/application path
([rawdraw_ui_manager.cc#L1280-L1377](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L1280-L1377)).

### 1.2 Wi-Fi provisioning and image transfer

If no credentials are stored, the board starts a provisioning AP. Holding UP and DOWN
together invokes the same configuration path. At this revision the provisioning AP is
configured without a password
([zectrix-s3-epaper-4.2.cc#L54-L60](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L54-L60),
[zectrix-s3-epaper-4.2.cc#L105-L158](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L105-L158)).

Holding BOOT on the gallery enters a separate photo-transfer AP. The transfer service uses
`InkScreen-AP`, password `12345678`, and `192.168.4.1`; the same HTTP server can also be
started on the station/LAN interface after network connection
([ap_transfer_server.cc#L36-L94](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ap_transfer_server.cc#L36-L94),
[application.cc#L366-L529](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L366-L529)).

The hosted page performs image resize and Floyd–Steinberg quantization in the browser, then
sends only a 15,000-byte monochrome or 30,000-byte four-color raw payload. This is a useful
architecture for a small MCU because PNG/JPEG decoding and color reduction remain on the
client. The server also exposes photo CRUD/reorder/show operations and device control
([ap_transfer_server.cc#L344-L545](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ap_transfer_server.cc#L344-L545),
[ap_transfer_server.cc#L556-L653](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ap_transfer_server.cc#L556-L653)).

Security is intentionally minimal: the management API is plaintext HTTP without
authentication, and it can mutate storage, force display, stop services, or request sleep.
It is suitable for a trusted AP/LAN only unless an authorization boundary is added.

### 1.3 Status, battery, clock, and power behavior

The status model carries Wi-Fi state, local HTTP service state, battery/charging state,
time/date, and page title. Time synchronization uses `ntp.aliyun.com`,
`cn.pool.ntp.org`, and `pool.ntp.org`
([rawdraw_ui_manager.h#L82-L101](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.h#L82-L101),
[application.cc#L280-L330](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L280-L330)).

The application supports inactivity-based and manual deep sleep, BOOT/GPIO0 wake, and
sleep blockers for active operations. Slideshow and the HTTP management server suppress
automatic sleep. Before sleeping, the display is put into panel deep sleep and its power
rail is disabled
([application.cc#L431-L529](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L431-L529),
[sleep_manager.cc#L34-L119](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/sleep_manager.cc#L34-L119)).

The active-low status LED is normally off. It pulses for activity, blinks while charging,
and stays on when full; factory test can override it. Thus the upstream behavior is not an
always-on power light
([board_power_bsp.cc#L8-L65](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/board_power_bsp.cc#L8-L65)).

## 2. Display architecture and interaction constraints

The renderer uses a 400×300 semantic 2bpp framebuffer: `00` black, `01` white, `10`
yellow, and `11` red. The display implementation maintains current, previous, and
asynchronous-send snapshots. In four-color mode those are 30,000 bytes each, so the frame
buffers alone consume roughly 90 KB of PSRAM
([rawdraw.h#L2-L15](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/rawdraw/rawdraw.h#L2-L15),
[rawdraw.h#L102-L130](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/rawdraw/rawdraw.h#L102-L130),
[custom_lcd_display.h#L91-L165](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.h#L91-L165)).

Refresh is delegated to a dedicated FreeRTOS task and includes debounce, frame differencing,
dirty-region merging, and suppression of tiny changes. However, the policy explicitly sets
every four-color update to full refresh. The dirty-region path is effectively for the 1bpp
panel mode, not a four-color partial-refresh implementation
([custom_lcd_display.cc#L444-L665](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L444-L665),
[custom_lcd_display.cc#L993-L1015](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L993-L1015)).
For the same reason, minute clock refresh is disabled and a direct four-color photo path is
disabled because the panel can remain busy for minutes
([rawdraw_ui_manager.cc#L30-L35](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L30-L35),
[rawdraw_ui_manager.cc#L597-L607](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L597-L607)).

Although the panel work runs asynchronously, navigation that requests a refresh sets
`input_refresh_locked_` until the refresh-idle callback fires. Consequently, the upstream
interaction model does not accept and coalesce further navigation while a long four-color
refresh is in progress
([rawdraw_ui_manager.cc#L356-L369](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L356-L369),
[rawdraw_ui_manager.cc#L710-L715](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L710-L715),
[rawdraw_ui_manager.cc#L829-L849](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L829-L849)).

This is the largest architectural mismatch with the current firmware's capacity-one
“latest state wins” display queue: importing upstream UI code wholesale would regress
refresh-time input behavior. Its storage, widgets, and service patterns are separable from
that lock policy.

## 3. Substantial modules that are compiled but not wired into the product

`RawDrawPageId` declares chat, ebook, weather, news, weather detail, photo detail, life bar,
almanac, log, year progress, calendar, and debugging pages. The manager constructs or can
address many matching renderers, but its quick-switch list contains only Gallery and
Settings, and the board never registers a double-click handler that would open that menu
([rawdraw_ui_manager.h#L61-L80](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.h#L61-L80),
[rawdraw_ui_manager.cc#L538-L558](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L538-L558),
[rawdraw_ui_manager.cc#L647-L658](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L647-L658),
[zectrix-s3-epaper-4.2.cc#L349-L465](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L465)).

Specific module maturity:

- **Weather** has a structured renderer and API client, but initializes with no data and
  shows “暂无天气数据”; no application code calls the API or injects weather
  ([weather_renderer.cc#L132-L175](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/weather_renderer.cc#L132-L175),
  [weather_api.cc#L313-L363](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/weather_api.cc#L313-L363)).
- **News** supports list selection, preview, and a “read aloud” callback, but starts empty
  and receives no application data
  ([news_renderer.cc#L98-L169](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/news_renderer.cc#L98-L169),
  [news_renderer.cc#L355-L383](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/news_renderer.cc#L355-L383)).
- **Ebook** has UTF-8 text wrapping, pagination, and portrait/landscape reader logic, but
  only exposes setters for a file list and content; no application-owned storage/import
  route supplies them
  ([ebook_renderer.cc#L128-L190](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ebook_renderer.cc#L128-L190),
  [ebook_renderer.cc#L320-L373](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ebook_renderer.cc#L320-L373)).
- **Calendar, year progress, and almanac** are relatively self-contained and derive their
  state from local time. Calendar includes lunar-date calculation and button navigation;
  the almanac's auspicious/inauspicious content is explicitly a simplified lookup based on
  lunar day
  ([calendar_renderer.cc#L52-L80](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/calendar_renderer.cc#L52-L80),
  [almanac_renderer.cc#L117-L138](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/almanac_renderer.cc#L117-L138)).
- **Life bar** is demonstrative rather than user-configurable: birth date is hard-coded to
  1990-01-01 and expected lifespan to 80 years
  ([lifebar_renderer.cc#L30-L60](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/lifebar_renderer.cc#L30-L60)).
- **BLE image push** implements a GATT service and transfer state machine, but is never
  initialized in the normal application. It accepts only a 400×300 1bpp buffer up to
  15,000 bytes, so it does not implement four-color image transfer
  ([ble_image_receiver.h#L1-L18](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ble_image_receiver.h#L1-L18),
  [ble_gatt_service.cc#L136-L186](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/common/ble_gatt_service.cc#L136-L186)).

Weather, holiday, BLE, and the dormant renderers are nevertheless listed in the component
build. “Included in CMake” therefore must not be interpreted as “reachable feature”
([CMakeLists.txt#L55-L87](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/CMakeLists.txt#L55-L87)).

## 4. Audio, voice, and board peripherals

Startup creates the ES8311 codec and starts `AudioService`. The service creates audio-input,
audio-output, and Opus tasks, with the codec task alone configured with a 26 KB stack. It
has queues, codec work, and idle shutdown of codec I/O
([application.cc#L122-L135](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L122-L135),
[audio_service.cc#L22-L104](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/audio/audio_service.cc#L22-L104),
[audio_service.h#L120-L147](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/audio/audio_service.h#L120-L147)).

However, `Application` does not establish the advertised assistant server protocol or bind
the voice callbacks needed to make BOOT long-press a complete voice interaction. The stream
pipeline still marks TTS audio integration as TODO. Board initialization also enables the
audio power rail before the higher-level idle behavior can act
([zectrix-s3-epaper-4.2.cc#L265-L277](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L265-L277),
[stream_pipeline.cc#L150-L163](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/streaming/stream_pipeline.cc#L150-L163)).
This cluster carries substantial RAM, task, power, and server dependencies relative to its
current user value.

The board also initializes PCF8563 RTC and GT23SC6699 NFC devices. In the pinned product
path, the RTC and NFC accessors are consumed by the factory test service, and `IsFactoryTestMode()`
returns false. These modules demonstrate hardware access but are not normal end-user
features
([zectrix-s3-epaper-4.2.cc#L163-L174](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L163-L174),
[zectrix-s3-epaper-4.2.cc#L286-L311](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L286-L311)).

## 5. TODO and backend claims are not implemented here

The only TODO UI in the firmware is an older LVGL `TodoPage`. Its model is just
`{text, completed}` and its API supports set/add/update/remove. It has no RawDraw page ID,
button route, persistence adapter, sync protocol, or server integration
([todo_page.h#L10-L44](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/pages/todo_page.h#L10-L44),
[todo_page.cc#L25-L88](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/pages/todo_page.cc#L25-L88)).
Neither TODO source file appears in the current component source list
([CMakeLists.txt#L1-L87](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/CMakeLists.txt#L1-L87)).

The README says the repository contains a Python backend, TODO synchronization, voice/TTS,
OTA APIs, and associated service files
([README.md#L3-L15](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/README.md#L3-L15),
[README.md#L153-L183](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/README.md#L153-L183)).
At the pinned commit, the `server/` tree contains only `mock_client.py`, a simulator that
expects an external WebSocket server. The named `llmserve.py`, `push_image.py`, static UI,
requirements, and deployment files are absent
([server tree](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/tree/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/server),
[mock_client.py#L1-L15](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/server/mock_client.py#L1-L15)).

## 6. Hardware and runtime assumptions

The target configuration assumes an ESP32-S3 at 240 MHz, 16 MB QIO flash, and octal PSRAM
at 80 MHz. The dependency lock records ESP-IDF 6.0.0 while the component manifest requires
at least 5.4
([sdkconfig.defaults.esp32s3#L2-L38](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/sdkconfig.defaults.esp32s3#L2-L38),
[dependencies.lock#L555-L565](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/dependencies.lock#L555-L565)).

Board-level assumptions include:

- SSD2683 400×300 four-color panel on SPI3 at 40 MHz;
- GPIO39 UP, GPIO18 DOWN, and GPIO0 BOOT;
- ES8311 audio at 16 kHz I²S;
- PCF8563 RTC and GT23SC6699 NFC on I²C;
- ADC battery measurement plus charge/full GPIO signals;
- independently controlled EPD, audio, amplifier, and battery-sense power rails.

These mappings are centralized in the board configuration
([config.h#L6-L62](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/config.h#L6-L62),
[zectrix-s3-epaper-4.2.cc#L265-L346](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L265-L346)).

## 7. Integration signals for downstream decisions

This inventory does not select the rollout, but it narrows the credible candidates:

- **Strong evidence / separable:** status-bar concepts, charging LED policy, battery model,
  inactivity/deep-sleep coordination, browser-side image conversion, raw asset storage,
  local HTTP management, UTF-8 wrapping/layout helpers, and self-contained calendar/progress
  calculations.
- **Useful only after a new boundary is designed:** Wi-Fi provisioning, LAN APIs, persisted
  settings, RTC-backed time, photo/ebook asset management, and authenticated remote content.
- **Do not import as-is:** refresh-time input locking, forced “partial” assumptions for a
  four-color panel, fixed/open network credentials, unauthenticated device-control HTTP,
  hard-coded life data, and the current audio rail/task startup policy.
- **Not evidence of a finished feature:** TODO sync, AI assistant backend, OTA service,
  weather/news product flows, BLE four-color transfer, and NFC end-user workflows.

The upstream repository is most valuable as a library of proven board services and UI
patterns, not as a complete application architecture to transplant wholesale.
