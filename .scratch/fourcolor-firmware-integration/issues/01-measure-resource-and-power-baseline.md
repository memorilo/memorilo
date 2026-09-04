# Measure the firmware resource and power baseline

Status: ready-for-human

## Goal

Record the baseline that every service-bearing feature must preserve or intentionally change.

## Scope

- Record release binary size, free internal heap, free PSRAM, and minimum heap watermark.
- Record main/display task stack high-water marks.
- Measure idle, physical refresh, and post-refresh current draw.
- Record current boot time and the observed full-refresh duration.

## Acceptance criteria

- Results are stored in a reproducible Markdown report with exact build features and firmware revision.
- A repeatable diagnostic command or firmware screen exposes the software measurements.
- Later tickets can state explicit before/after budgets instead of assuming available resources.

## Verification

- Host build and tests.
- Real-device build, flash, serial capture, and current measurement using the documented ESP-IDF workflow.

## Comments

- 2026-09-03: Added repeatable image and runtime diagnostics, corrected the
  Windows build target default used by the flash/monitor workflow, passed host
  tests, built and flashed the real-display firmware, and captured heap, PSRAM,
  stack, boot, and refresh baselines. Results and reproduction steps are in
  [the baseline report](../research/resource-and-power-baseline-2026-09-03.md).
  Idle, refresh-average/peak, and post-refresh current still require readings
  from an external inline power meter; no compatible measurement device is
  attached to the host.

- 2026-09-04: Software diagnostics and reproducible artifact reporting remain
  complete. The only open acceptance action is physical measurement with the
  NOTE4C and an inline current meter; this ticket is therefore ready for human
  measurement rather than waiting for a software implementation.
