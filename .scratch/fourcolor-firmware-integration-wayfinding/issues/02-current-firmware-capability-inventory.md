Type: research
Status: resolved

## Question

What capabilities, constraints, extension seams, and verified behaviors exist in the current Rust + ESP-IDF TODO firmware, especially around model ownership, rendering, buttons, refresh concurrency, power, memory, and the retained C display driver?

## Answer

The current firmware has a useful selective-integration spine: Rust owns the volatile TODO model, packed four-color rendering, button policy, and a capacity-one refresh scheduler, while a single display thread exclusively owns the retained C driver. Input and model mutation continue during the panel's blocking full refresh, but the in-flight refresh cannot be cancelled; intermediate requests coalesce into one later render of the latest state. Panel power is gated and the status LED stays off, while the ESP32 itself remains continuously awake with its battery latch asserted. One frame costs 30,000 bytes and the display task requests a 64 KiB stack, but actual heap, flash, PSRAM placement, stack watermark, and power headroom are not yet measured.

The primary extension seams are the Rust application snapshot, pure renderer, button-to-command layer, single-owner refresh-intent queue, narrow FFI bridge, and a missing application power lifecycle. Dynamic data requires replacing static strings and adding stable IDs; richer UI needs fonts/layout/viewport support; partial or monochrome refresh must cross Rust, FFI, and C because the current bridge exposes only construct/full-frame-refresh/delete. See [Current embedded firmware capabilities and constraints](../research/current-firmware-capabilities-and-constraints.md) for the cited inventory and verification notes.
