# Current embedded firmware capabilities and constraints

Research date: 2026-09-03  
Repository revision inspected: `ecb96fb` (`feat: migrate embedded firmware to Rust and add flashing tools`)

## Scope and verification

This inventory covers the current firmware under `apps/note4c-firmware` and the canonical real-device workflow in `docs/agents/esp-idf-flashing.md`. It distinguishes source-level guarantees from behaviors that have only been documented or previously observed on hardware.

The host command `cargo +stable test --target x86_64-pc-windows-msvc` was run from the firmware crate on 2026-09-03. All four current unit tests passed: two model tests, one framebuffer/color-order test, and one UI selection-border test. The test definitions are in the [model](../../../apps/note4c-firmware/src/model.rs#L90), [framebuffer](../../../apps/note4c-firmware/src/framebuffer.rs#L49), and [UI](../../../apps/note4c-firmware/src/ui.rs#L132) modules. No real-device build, flash, refresh-duration measurement, power measurement, or heap/flash-size measurement was performed for this ticket.

## Capability summary

| Area | Current capability | Binding constraint for integration |
| --- | --- | --- |
| Model | Rust-owned in-memory TODO list with `Open`, `Doing`, and `Done`, wrapped selection, and complete/reopen toggle | Items use `&'static str`, have no stable IDs, and are initialized from bundled fake data; there is no persistence, clock, networking, or synchronization boundary ([model](../../../apps/note4c-firmware/src/model.rs#L1)) |
| Rendering | Pure Rust renderer writes directly into a 400×300 packed four-color framebuffer | Fixed 5×7 Latin-oriented glyph table, hard-coded layout/date, no scrolling or pagination, and no dirty-region output ([UI](../../../apps/note4c-firmware/src/ui.rs#L14), [framebuffer](../../../apps/note4c-firmware/src/framebuffer.rs#L1)) |
| Input | Three active-low, pull-up buttons with polling and 35 ms debounce | Only `Up`, `Ok`, and `Down` events exist; there is no long-press, repeat, chord, release, or wake-source abstraction ([board](../../../apps/note4c-firmware/src/board.rs#L10)) |
| Refresh scheduling | Input/model mutation continues while the panel refreshes on a dedicated display thread; a capacity-one channel coalesces requests | An in-flight refresh cannot be cancelled; the API always sends a complete 30,000-byte frame, so visual feedback still waits for the current 20–25 second refresh and possibly one coalesced successor ([main](../../../apps/note4c-firmware/src/main.rs#L47), [flashing guide](../../../docs/agents/esp-idf-flashing.md#L85)) |
| Power | Status LED is held off; panel power is enabled only around refresh and is disabled on return; the panel receives power-off/deep-sleep commands on the successful path | The ESP32 application itself never enters light/deep sleep, polls every 20 ms indefinitely, and keeps the battery latch asserted ([board](../../../apps/note4c-firmware/src/board.rs#L38), [main](../../../apps/note4c-firmware/src/main.rs#L59), [C driver](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L123)) |
| Memory | One packed frame is 30,000 bytes; real interactive firmware keeps one reusable Rust framebuffer plus model/channel/task state | The display task requests a 64 KiB stack; fake display adds a second 30,000-byte shadow frame; PSRAM is enabled but buffer placement and remaining headroom are not measured or explicitly controlled ([framebuffer](../../../apps/note4c-firmware/src/framebuffer.rs#L1), [main](../../../apps/note4c-firmware/src/main.rs#L93), [sdkconfig](../../../apps/note4c-firmware/sdkconfig.defaults#L1)) |
| Driver boundary | Rust owns application state and a single opaque display handle; C owns SPI, GPIO panel control, BUSY waits, the SSD2683 command sequence, power-off, and teardown | FFI exposes only `new`, full-frame `refresh`, and `delete`; partial/monochrome refresh would require a deliberate extension through Rust API, FFI, and C implementation ([bridge header](../../../apps/note4c-firmware/components/zectrix_note4c_epd/include/note4c_epd_bridge.h#L7), [upstream note](../../../apps/note4c-firmware/components/zectrix_note4c_epd/UPSTREAM.md#L11)) |
| Build/test/flash | Host tests, fake display, real display, and static color-test variants; ESP-IDF 5.5.2; official Espressif image/flash/monitor path | Host tests do not exercise target board/display modules; real-device validation remains a separate build/flash/wait process ([Cargo features](../../../apps/note4c-firmware/Cargo.toml#L7), [flashing guide](../../../docs/agents/esp-idf-flashing.md#L1)) |

## Model ownership and domain behavior

The application model is entirely Rust-owned. `TodoModel` holds a `Vec<TodoItem>` and a selected index. Each item contains a static title, static due text, status, and indentation byte. The default constructor embeds six fake items directly in firmware. Selection wraps in both directions; `Ok` maps every non-`Done` state, including `Doing`, to `Done`, while a `Done` item is reopened as `Open` ([model types and fixture](../../../apps/note4c-firmware/src/model.rs#L1), [model operations](../../../apps/note4c-firmware/src/model.rs#L69)).

Important constraints:

- `&'static str` makes the current item shape suitable for compiled-in fixtures, not dynamically owned or downloaded data. Adding editable, persisted, or synchronized content requires changing string ownership and probably introducing stable item identity.
- `indent` is only a rendering offset. There are no parent IDs, tree invariants, collapse state, or navigation rules, so it does not yet form a hierarchical TODO domain.
- `due` is presentation text. There is no date/time parsing, RTC/system-time service, overdue calculation, or date-driven sorting.
- State is volatile. `main` constructs `TodoModel::default()` at each boot, and the crate dependencies and startup path contain no NVS/filesystem/database/network service ([startup](../../../apps/note4c-firmware/src/main.rs#L47), [dependencies](../../../apps/note4c-firmware/Cargo.toml#L13)).

The useful integration seam is the small mutation surface: upstream-inspired screens or commands can continue to mutate a Rust application model, then enqueue a refresh, without giving application ownership to the C driver. Before adding dynamic sources or richer navigation, the model should become an application-owned snapshot with owned strings, stable identifiers, and explicit view/navigation state.

## Framebuffer and UI rendering

The native framebuffer contract is 400×300 at two bits per pixel, four pixels per byte, most-significant pixel first. The Rust color enum maps black, white, yellow, and red to values 0–3, and `set_pixel` clips out-of-bounds coordinates rather than writing outside the buffer. A complete frame is exactly 30,000 bytes ([framebuffer constants and encoding](../../../apps/note4c-firmware/src/framebuffer.rs#L1)).

`ui::render` is synchronous and side-effect free apart from its caller-provided framebuffer. It clears the frame to white, draws a fixed header/date, renders every item at a fixed 35-pixel row pitch, highlights selection in red, uses yellow for an open checkbox and black for a completed checkbox, prints `DOING`, and draws fixed button help at the bottom ([renderer](../../../apps/note4c-firmware/src/ui.rs#L83)). This pure `model -> framebuffer` boundary is the cleanest place to combine additional views, status overlays, menus, or upstream interaction concepts while retaining Rust ownership.

Rendering constraints:

- The hand-coded 5×7 glyph table covers a small ASCII-like set, uppercases input, and substitutes an unknown glyph for unsupported characters. It is not a Chinese/Unicode text system ([glyph table](../../../apps/note4c-firmware/src/ui.rs#L14)).
- Text truncation is by character count only; there is no wrapping, ellipsis, shaping, font metrics, or localization ([text function](../../../apps/note4c-firmware/src/ui.rs#L71)).
- Layout assumes the current short list. The loop renders all items and relies on pixel clipping; there is no viewport, pagination, scrolling, or empty/error/loading state ([item loop](../../../apps/note4c-firmware/src/ui.rs#L90)).
- The renderer emits no dirty rectangle, color-plane analysis, or refresh-policy hint. A rendering change always becomes a full-frame refresh request.

The separate `render_color_test` fills four vertical color bars and is targetable through the `color-test` feature. It is a hardware diagnostic rather than an application screen, and disables TODO input in that variant ([color test](../../../apps/note4c-firmware/src/framebuffer.rs#L35), [color-test startup](../../../apps/note4c-firmware/src/main.rs#L29)).

## Buttons and interaction behavior

Board initialization configures GPIO39, GPIO0, and GPIO18 as active-low inputs with internal pull-ups and maps them to `Up`, `Ok`, and `Down`. It also configures GPIO17 as a battery latch and GPIO3 as the active-low status LED output ([board pin map](../../../apps/note4c-firmware/src/board.rs#L10), [initialization](../../../apps/note4c-firmware/src/board.rs#L31)).

`poll_button` is a synchronous level poller with 35 ms debounce. A press is emitted once after the low level remains stable; clearing its debounce timestamp prevents key repeat until a release transition is observed. The application polls every 20 ms, handles at most one returned button per loop, mutates the model while holding its mutex, and immediately asks the scheduler for a refresh ([poller](../../../apps/note4c-firmware/src/board.rs#L52), [main input loop](../../../apps/note4c-firmware/src/main.rs#L59)).

This makes a command/event layer an appropriate extension seam. Long-press, auto-repeat, page navigation, mode switching, or contextual actions should be represented above raw GPIO polling so the current three-button hardware can drive richer features without coupling feature logic to pin numbers. The present code has no gesture timing, action routing, or visible immediate feedback independent of e-paper refresh.

## Refresh concurrency and responsiveness

The interactive variant creates an `Arc<Mutex<TodoModel>>`, a synchronous channel of capacity one, and a named display thread with a requested 64 KiB stack. The display thread owns the `Display`, reuses one 30,000-byte framebuffer, snapshots the model by rendering it under the mutex, releases the model lock, and then performs the long C refresh ([scheduler and display task](../../../apps/note4c-firmware/src/main.rs#L47), [display task](../../../apps/note4c-firmware/src/main.rs#L93)).

The concurrency semantics are useful and specific:

1. Button polling runs on the main task while the panel driver blocks only the display task.
2. The model mutex is held during CPU rendering but not during the panel's long BUSY wait, so input can mutate state throughout most of the physical refresh.
3. `try_send` treats a full channel as success. Therefore there can be at most one pending refresh token; repeated button activity is coalesced, and the next render uses the latest model state rather than replaying intermediate frames ([request coalescing](../../../apps/note4c-firmware/src/main.rs#L85)).
4. The current refresh cannot be interrupted or superseded. If an input arrives during a 20–25 second full refresh, the old physical update finishes before the latest state can begin its own update. The repository's canonical guide documents the observed refresh duration ([flashing guide](../../../docs/agents/esp-idf-flashing.md#L85)).
5. A refresh error is logged and the display thread continues waiting for another request. If the thread exits and disconnects the channel, the main loop turns the next refresh request into a fatal error ([display error handling](../../../apps/note4c-firmware/src/main.rs#L103), [channel error handling](../../../apps/note4c-firmware/src/main.rs#L85)).

This scheduler should remain the ownership spine for new features: update Rust state quickly, enqueue a render intent, and keep the C handle confined to one thread. A faster refresh path should add policy/intent to this seam—such as full color versus fast monochrome and optional dirty region—rather than letting feature code call the C driver concurrently.

## Power behavior

The status LED is set high and therefore remains off under the board's active-low convention. The battery latch is set high and never released in the current process. The main task runs forever with a 20 ms polling sleep; there is no ESP32 light sleep, deep sleep, wake-source setup, idle timeout, or explicit shutdown state ([board outputs](../../../apps/note4c-firmware/src/board.rs#L38), [main loop](../../../apps/note4c-firmware/src/main.rs#L59)).

Panel power is more disciplined. The C driver starts with panel power low, raises it before reset and refresh, waits on active-low BUSY with a 120-second configured timeout and 50 ms FreeRTOS delays, sends the full frame, activates the panel, sends power-off (`0x02`) and deep-sleep (`0x07`) commands on the successful sequence, and finally drives panel power low even when an earlier refresh step fails ([default configuration](../../../apps/note4c-firmware/components/zectrix_note4c_epd/include/zectrix_note4c_epd.h#L30), [BUSY wait](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L64), [activation/deep sleep](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L123), [refresh cleanup](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L219)).

Consequently, upstream features involving Wi-Fi, scheduled updates, audio, clocks, or background work cannot be assessed only by whether they fit flash/RAM. They also need an explicit device wake/idle/shutdown policy; otherwise they would extend an already continuously awake MCU design. Panel sleep and MCU sleep are separate concerns in this codebase.

## Memory and resource constraints

Known source-level allocations are:

- 30,000 bytes for the reusable packed framebuffer in the real interactive display thread.
- A requested 65,536-byte stack for that thread.
- A heap `Vec` for the TODO list plus small `Arc`, mutex, and channel state.
- In the fake backend, another 30,000-byte shadow framebuffer; in the color-test path, one 30,000-byte framebuffer on the main path instead of the interactive display thread ([display task allocation](../../../apps/note4c-firmware/src/main.rs#L93), [fake backend](../../../apps/note4c-firmware/src/display.rs#L35), [color-test allocation](../../../apps/note4c-firmware/src/main.rs#L35)).
- The C driver allocates a small handle and initializes an SPI DMA bus whose declared maximum transfer size is 30,000 bytes, although the implementation streams 100-byte rows and yields every 16 rows ([driver allocation/SPI setup](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L151), [row streaming](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L107)).

The target configuration enables 16 MB flash and octal PSRAM, uses a 1 kHz FreeRTOS tick, and gives the ESP main task a 10,000-byte stack ([sdkconfig defaults](../../../apps/note4c-firmware/sdkconfig.defaults#L1)). Release builds optimize for size, enable LTO, and use one codegen unit ([release profile](../../../apps/note4c-firmware/Cargo.toml#L31)). However, no source explicitly chooses internal RAM versus PSRAM for the Rust buffers, and this ticket found no recorded heap watermark, stack high-water mark, final binary size, or power measurement. Candidate comparisons must therefore treat RAM/flash/power headroom as unmeasured, not abundant.

## Retained C display-driver boundary

Rust's `Display` has mutually exclusive fake and real backends. The real backend stores an opaque non-null C pointer, is marked `Send` under the invariant that exactly one display thread owns it, checks the framebuffer length, invokes the bridge, and deletes the handle on drop ([Rust display wrapper](../../../apps/note4c-firmware/src/display.rs#L13)). Compile-time checks require exactly one display backend ([crate feature guards](../../../apps/note4c-firmware/src/lib.rs#L9)).

The public C bridge deliberately exposes only three operations: construct with fixed default board configuration, refresh one complete framebuffer, and delete ([bridge API](../../../apps/note4c-firmware/components/zectrix_note4c_epd/include/note4c_epd_bridge.h#L7), [bridge implementation](../../../apps/note4c-firmware/components/zectrix_note4c_epd/note4c_epd_bridge.c#L11)). The retained driver owns:

- SPI3, mode 0, 40 MHz, and GPIO assignments for data/command, chip select, clock, MOSI, reset, BUSY, and panel power ([driver defaults](../../../apps/note4c-firmware/components/zectrix_note4c_epd/include/zectrix_note4c_epd.h#L30));
- panel reset/wake timing and active-low BUSY polling;
- full-frame row streaming in native packed format;
- activation, power-off/deep-sleep command sequence, hardware power gating, and SPI teardown ([C driver](../../../apps/note4c-firmware/components/zectrix_note4c_epd/zectrix_note4c_epd.c#L85)).

The component is pinned to upstream commit `51812e4ab3fa80ba7a5a5a274635ca2cf3901a25`. Its provenance note explicitly says that application UI, LVGL, audio, networking, partial-refresh scheduling, and monochrome fallback were excluded from the adaptation ([upstream provenance](../../../apps/note4c-firmware/components/zectrix_note4c_epd/UPSTREAM.md#L1)). Therefore those capabilities are not recoverable by only changing Rust UI code. Display modes or partial-window operations must first be proven against the panel/controller path, then added as narrow C driver operations and surfaced through typed Rust methods while preserving single-thread ownership.

## Build, test, and flashing behavior

The Cargo feature matrix contains `fake-display` (default), `real-display`, and `color-test`. The crate pins ESP-IDF 5.5.2 and registers the local C component through `esp-idf-sys`; the target is ESP32-S3 ([Cargo configuration](../../../apps/note4c-firmware/Cargo.toml#L7), [sdkconfig target](../../../apps/note4c-firmware/sdkconfig.defaults#L1)). The default fake backend copies and counts framebuffer colors without sending panel commands, which supports target-side application work without panel I/O but is not a graphical simulator ([fake backend](../../../apps/note4c-firmware/src/display.rs#L35)). Host builds exclude `board` and `display`, and host `main` only prints a target-build instruction, so current unit coverage is intentionally limited to pure model/rendering logic ([conditional modules](../../../apps/note4c-firmware/src/lib.rs#L1), [host main](../../../apps/note4c-firmware/src/main.rs#L117)).

The canonical device workflow is not `cargo run` or stale `idf.py flash`. Cargo/`esp-idf-sys` builds the Rust ELF and ESP-IDF bootloader/partition table; the PowerShell script uses pinned official `esptool` through `uvx`, converts the ELF, validates the image, and writes bootloader at `0x0000`, partition table at `0x8000`, and the application at `0x10000` in one verified session. Monitoring is separate and opens the existing ELF without resetting the target ([flashing workflow](../../../docs/agents/esp-idf-flashing.md#L1), [layout](../../../docs/agents/esp-idf-flashing.md#L48), [monitoring](../../../docs/agents/esp-idf-flashing.md#L58)).

Feature integration should preserve the three build variants and add host tests at pure Rust seams. Changes to C commands, refresh modes, pin behavior, sleep/wake behavior, or peripheral use require target builds plus real-device acceptance tests because current host tests cannot exercise them.

## Decision-relevant integration seams

1. **Application snapshot seam:** evolve `TodoModel` into owned, identifiable domain/view state. Upstream features that only need another screen or navigation state can stay entirely in Rust.
2. **Pure renderer seam:** keep screens as deterministic `state -> packed framebuffer` functions. A higher-level layout/font layer can be introduced above `set_pixel` without importing upstream LVGL wholesale.
3. **Input-command seam:** translate the three raw button events into contextual commands/gestures before mutating application state. This is where menus, page switches, long press, and multi-step workflows should compose.
4. **Refresh-intent seam:** retain a single display owner and coalescing, but enrich the queued intent if compatibility research proves multiple refresh modes or dirty regions. Do not let independent features invoke the opaque C handle.
5. **Narrow FFI seam:** extend the three-function bridge only for panel operations that cannot live in Rust. Networking, application logic, view state, and scheduling do not belong in the retained C component.
6. **Power-policy seam:** add an explicit application lifecycle before adopting always-on or scheduled upstream services. Panel power-off is already encapsulated, but MCU sleep/wake and battery-latch policy are absent.
7. **Verification seam:** use host tests for model, navigation, layout, encoding, and refresh-policy decisions; use the documented ESP-IDF artifact/esptool chain for device-only behavior.

## Bottom line for the integration plan

The current firmware already has a strong ownership shape for selective adoption: Rust owns state, rendering, input policy, and refresh scheduling; one display thread owns a minimal C panel driver. The safest upstream capabilities are those that can be expressed as additional Rust state, commands, and pure screens while reusing the existing full-frame scheduler. Features that depend on Unicode fonts, persistence/networking, audio, MCU sleep/wake, or alternative panel refresh modes cross currently absent or deliberately narrow boundaries and need explicit staged work plus resource/device measurements before prioritization.
