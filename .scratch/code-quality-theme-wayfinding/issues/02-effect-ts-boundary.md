# Effect-TS Adoption Boundary

Type: grilling
Status: resolved

## Question

Where should `effect-ts` be introduced or expanded because it materially improves reliability, and where should ordinary TypeScript remain?

Use the existing `packages/effect-lifecycle`, configuration, IPC/API, persistence, request, validation, and resource-lifecycle code as the comparison set. Decide a boundary contract for:

- typed domain/infrastructure errors versus localized UI messages;
- resource acquisition and ordered cleanup;
- cancellation, supersession, retries, and concurrency;
- schema decoding and unknown external data;
- synchronous pure calculations and React presentation, which should remain ordinary TypeScript unless a concrete counterexample is found.

The answer must identify candidate modules, expected reliability gain, migration shape, and explicit non-goals so `Effect` does not become a blanket wrapper.

## Evidence gathered

- `packages/effect-lifecycle` already provides deep internal seams for serial/unbounded admission, single-flight work, latest-operation supersession, interruption/drain shutdown, retryable close, ordered/aggregate cleanup, and rollback. Its public interfaces intentionally expose `Promise` for Promise callers while accepting native `Effect` operations where needed.
- `packages/config` already uses `createOperationSupervisor` and `createResourceScope`; `json-file-adapter.ts` already uses `Effect.acquireUseRelease` for per-path serialization and atomic writes. Replacing its public Promise adapter with `Effect` would add wrapper churn without changing the reliability contract.
- `apps/desktop/api` already uses Effect Schema for strict request/result decoding and has typed transport errors (`DesktopHonoError`, `DesktopHonoProtocolError`, `DesktopHonoRequestError`). RPC route handlers still return Promise/unknown and the server maps thrown causes at one transport seam. Effect would add clear value there only if request cancellation, typed failure channels, or resource ownership are introduced at the same time.
- `apps/desktop/main/src/notes/note-application-commands.ts` mixes Promise serialization (`serialize`) with native Effect serialization (`serializeEffect`). Multi-step mutations such as `applyTopicEdits`, external-update saving, recurring-task completion, and note mutations combine open/validate/apply/persist/invalidate/broadcast steps; these are the strongest candidates for typed failure composition and guaranteed cleanup. Single storage queries are not.
- `apps/desktop/renderer/src/features/notes/persistence/note-persistence-manager.ts` is already Effect-native internally for debounce fibers, interruption, draining, retry-sensitive queues, and `ensuring` cleanup, while preserving a small Promise/observer interface for React. This is an example to preserve rather than broaden indiscriminately.
- `apps/desktop/renderer/src/shared/effect-query.ts` wraps arbitrary Promise requests in one `DesktopClientError`; it is a useful UI adapter but does not justify making React components or query result rendering Effect-based.
- `apps/desktop/main/src/lifecycle/note-save-handshake.ts` already gains concrete value from `Effect.scoped`, `acquireRelease`, timeout, and cleanup aggregation. Similar resource/lifecycle seams should use Effect; pure calculations and ordinary UI should not.

## Decision draft

1. **Adopt Effect at mutation/resource/concurrency seams, not as a workspace-wide coding style.** Prioritize note application mutations with multiple dependent steps, lifecycle handshakes, and operations with cancellation/supersession or keyed concurrency. Keep query-only handlers, pure calculations, React components, and existing Promise-facing public adapters ordinary TypeScript.
2. **Use tagged/structured failures internally and translate at transport/UI seams.** Domain and infrastructure code should return typed failure values or tagged errors; API/IPC wire layers encode stable codes/details; renderer features map those codes to localized messages. Do not let domain code return translation keys or localized strings.
3. **Reuse `effect-lifecycle` as the ownership seam.** Do not replace its Promise-facing interfaces. Extend it only when a missing invariant (for example, typed close failures or a reusable cancellation policy) is demonstrated by a migration.
4. **Do not migrate the entire RPC router or configuration store by default.** Their current Schema validation, operation serialization, resource ownership, and transport error seams already provide most of the benefit. Revisit them only if a concrete cancellation/typed-error gap is identified.
5. **First implementation slice:** convert the highest-risk note mutation cluster to a consistent Effect program while preserving the existing Promise-returning application interface; then evaluate whether the resulting error taxonomy should be shared with IPC/API handlers.

## Answer

Confirmed by the user. The Effect boundary is:

1. **Adopt Effect at mutation/resource/concurrency seams, not as a workspace-wide coding style.** Prioritize note application mutations with multiple dependent steps, lifecycle handshakes, and operations with cancellation/supersession or keyed concurrency. Keep query-only handlers, pure calculations, React components, and existing Promise-facing public adapters ordinary TypeScript.
2. **Use tagged/structured failures internally and translate at transport/UI seams.** Domain and infrastructure code should return typed failure values or tagged errors; API/IPC wire layers encode stable codes/details; renderer features map those codes to localized messages. Do not let domain code return translation keys or localized strings.
3. **Reuse `effect-lifecycle` as the ownership seam.** Do not replace its Promise-facing interfaces. Extend it only when a missing invariant (for example, typed close failures or a reusable cancellation policy) is demonstrated by a migration.
4. **Do not migrate the entire RPC router or configuration store by default.** Their current Schema validation, operation serialization, resource ownership, and transport error seams already provide most of the benefit. Revisit them only if a concrete cancellation/typed-error gap is identified.
5. **First implementation slice:** convert the highest-risk note mutation cluster to a consistent Effect program while preserving the existing Promise-returning application interface; then evaluate whether the resulting error taxonomy should be shared with IPC/API handlers.

The evidence and decision draft above remain part of the reliability audit record.
