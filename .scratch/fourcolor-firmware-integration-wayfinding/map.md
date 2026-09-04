## Destination

Produce a decision-ready, prioritized integration plan for adopting useful capabilities from `LazyYoun/youn-ink-fourcolor-firmware` into the current Rust + ESP-IDF TODO firmware, including how each capability composes with the existing TODO model, button handling, asynchronous refresh, power behavior, and retained C panel-driver boundary.

## Notes

- Use the `research`, `grilling`, and `domain-modeling` skills while resolving this map.
- Prefer primary evidence from the upstream source at its pinned/reference revision and from the current repository source.
- Evaluate candidates by user value, hardware compatibility, implementation risk, flash/RAM cost, power impact, input behavior during refresh, and fit with the Rust/C ownership boundary.
- This effort plans decisions only; it does not implement candidate features.

## Decisions so far

- [Inventory upstream firmware capabilities and assumptions](issues/01-upstream-capability-inventory.md): Treat upstream as a mature photo/storage/network/power pattern library; distinguish its normal gallery/AP path from disconnected renderers and absent TODO/backend claims, and do not inherit its refresh-time input lock or insecure local-management defaults.
- [Inventory current embedded firmware capabilities and constraints](issues/02-current-firmware-capability-inventory.md): Preserve the Rust-owned model/render/input scheduler and single-owner C driver; treat dynamic data, richer text/layout, MCU sleep, measured resource headroom, and alternate refresh modes as explicit new boundaries.
- [Evaluate technical compatibility and integration seams](issues/03-compatibility-and-integration-seams.md): Selectively adapt TODO-focused commands, persistence, status, power, and Rust UI foundations; preserve latest-state full refresh and the narrow C driver, while deferring service-heavy features and rejecting insecure, incomplete, or unsupported upstream paths.

## Not yet specified

No unresolved fog remains; the remaining frontier is already expressed as a ticket.

## Out of scope

- Server APIs, synchronization, authentication, and remote TODO persistence.
- Replacing the retained low-level C panel driver with a Rust reimplementation.
- PCB, enclosure, button, battery, or other hardware redesign.
- Implementing or flashing the selected features during this planning effort.
