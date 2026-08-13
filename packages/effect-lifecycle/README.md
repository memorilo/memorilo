# Effect lifecycle

This package owns three lifecycle seams that are used across the Electron
processes and platform packages:

- `createOperationSupervisor` admits Promise adapters and native Effects,
  serializes when requested, rejects after shutdown begins, and drains every
  accepted operation. Promise-backed work remains owned until it settles even
  when its adapter ignores `AbortSignal`.
- `createLatestOperationSupervisor` provides latest-wins admission per channel.
  It is serial by default when a transport must not overlap; callers may opt
  into parallel channels explicitly. Replacing a channel interrupts its Effect
  fiber, waits for the underlying operation to settle, and exposes a stale-value
  cleanup hook.
- `createResourceScope` owns acquired resources and explicit finalizers. It
  performs reverse-order dependent cleanup or aggregate cleanup, preserves
  failed finalizers for retry, and supports startup rollback plus ownership
  transfer. Committed dependent shutdown stops before releasing prerequisites;
  startup rollback still attempts every acquired finalizer because no live
  owner can safely retain those partially constructed resources.

The implementation uses Effect for the parts that require fibers, scopes,
semaphores, and interruption. It deliberately keeps Promise adapters in a
separate owned fiber set because browser and Electron transports frequently do
not implement cooperative cancellation. This is an ownership module, not a
replacement for general Effect composition; callers should use native Effect
`Scope`/`Fiber` directly when they do not need these Promise-drain or
latest-value invariants.

Failure aggregation helpers in `src/errors.ts` are shared by resource cleanup,
startup rollback, listener isolation, and multi-operation workflows so each
caller does not reimplement the single-error versus `AggregateError` rule.
The same module privately owns the retryable close tail used by all three state
machines; it is an implementation detail rather than a fourth public primitive.
An in-flight close is shared, failed cleanup remains retryable, and rejected
fire-and-forget closes are observed.
