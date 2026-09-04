Type: research
Status: resolved
Blocked by: 01, 02

## Question

For each plausible upstream capability, can it run on the current hardware and software architecture, where should it live across Rust application code and the retained C driver, and what conflicts or dependencies must be resolved?

## Answer

Selective integration is technically sound because the target MCU, panel, framebuffer format, and primary controls align, but the upstream C++ application architecture should not be transplanted. Preserve Rust ownership of domain state, commands, services, rendering, power policy, and the capacity-one latest-state refresh queue; keep C limited to verified SSD2683 commands, BUSY timing, and panel power sequencing.

Adopt or adapt the high-value foundations: richer three-button commands and a small page/settings shell, local TODO/settings persistence, battery/date status rendered only on an existing refresh, explicit inactivity/deep-sleep policy, Unicode-aware text/layout, and lightweight diagnostics. Calendar/year-progress views are credible after clock and layout foundations. Defer RTC, Wi-Fi, HTTP, gallery, weather/news, and ebook work until their prerequisites and measured resource budgets exist. Reject the upstream implementations or claims for refresh-time input locking, four-color partial refresh, fixed/open network management, BLE image push, audio/chat, NFC, OTA, and the legacy LVGL TODO page.

No selected foundation requires a broader domain than the flat TODO list, although persistence requires owned strings, stable IDs, schema versioning, and explicit view/settings state. Upstream four-color dirty-region code is not a partial-refresh solution; full refresh remains the supported baseline, and any fast monochrome path must be a separate hardware-validation effort with a narrow Rust refresh intent and C operation.

The capability matrix, dependency/resource/security risks, ownership table, and distinction between reusable concepts and copyable code are documented in [Compatibility and integration seams](../research/compatibility-and-integration-seams.md).
