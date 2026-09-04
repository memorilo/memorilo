# Add audio, voice, chat, and TTS

Status: ready-for-human
Blocked by: 01, 02, 04, 08, 13

## Goal

Add a complete voice interaction rather than merely initializing the upstream codec and task graph.

## Missing decisions

- Speech recognition, conversation, and TTS service/provider contracts.
- Whether audio leaves the local network, retention policy, and explicit privacy UX.
- Push-to-talk gesture, cancellation behavior, response presentation, and offline behavior.
- Resource and power budgets for codec, Opus, network, and playback tasks.

## Required acceptance direction

- Audio hardware and rails initialize only while the feature is in use.
- Recording is always visibly and physically initiated, cancellable, and never always-listening by default.
- Service failure cannot block TODO, display, provisioning, or sleep recovery.

## Decision

Defer implementation until a product owner selects a provider and accepts the
privacy boundary. The proposed contract is explicit push-to-talk only: PCM is
captured while the OK button is held, cancellable before upload, sent over an
authenticated local connection, and discarded after transcription/TTS. No
always-listening mode, cloud retention, or audio transport over BLE is allowed.
The audio rail and codec are acquired by a scoped service lease and released on
completion, failure, or cancellation; all responses are text-first so the
display remains usable during playback. Required follow-up decisions are the
provider endpoint, retention, locale, and measured RAM/current budget.
