Type: research
Status: resolved

## Question

What user-facing and platform capabilities does `LazyYoun/youn-ink-fourcolor-firmware` actually implement, how are they structured, and what hardware/services/runtime assumptions does each capability make?

## Answer

The pinned upstream revision is chiefly a functional four-color photo-frame product: persistent gallery, browser-side image conversion and AP/LAN transfer, Wi-Fi provisioning, status/battery/time UI, settings, and coordinated sleep/panel power. It also contains many compiled but unreachable renderer and service modules (weather, news, ebook, chat/audio, BLE image push, calendar/progress pages, RTC/NFC/factory test). The legacy TODO page is not built and has no persistence or synchronization, while the README's Python backend is absent from this revision.

Detailed evidence, capability classifications, constraints, and downstream integration signals are recorded in [Upstream four-color firmware capability inventory](../research/upstream-firmware-capability-inventory.md).
