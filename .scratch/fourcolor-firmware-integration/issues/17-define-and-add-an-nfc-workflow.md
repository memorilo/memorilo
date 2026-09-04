# Define and add an NFC workflow

Status: ready-for-human
Blocked by: 01, 02, 08

## Goal

Turn the board's factory-tested NFC peripheral into a specific end-user feature instead of importing unused driver code.

## Missing decisions

- The concrete workflow: open a task/list, authenticate an action, import an identifier, or another bounded behavior.
- Supported tag/card technology and whether writes are required.
- Privacy, replay, loss, and authorization behavior.

## Required acceptance direction

- NFC hardware remains powered down until an approved workflow needs it.
- Unrecognized or replayed data cannot mutate TODOs or configuration silently.
- Factory diagnostics and product behavior remain separate.

## Decision

Adopt a read-only NFC handoff workflow: an approved tag contains a short,
versioned Memorilo deep-link or TODO identifier, and the device only displays
the parsed target for confirmation. It never writes tags and never mutates a
TODO/configuration from an unconfirmed or malformed payload. The NFC service is
created only while the user enters the workflow, has a short timeout, and owns
the GT23SC6699 rail/I2C handle through a scoped lease. Replay protection uses a
nonce or monotonic tag counter when present; otherwise the confirmation screen
is mandatory. Human acceptance still needs the exact supported tag technology,
payload URI, and a physical tag test matrix.
