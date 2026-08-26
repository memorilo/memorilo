# Implementation Sequence and Acceptance Criteria

Type: grilling
Status: resolved
Blocked by: 01, 02, 03, 04

## Question

Once the learning model, editable interaction, sidebar, and migration boundary are settled, what ordered implementation work and acceptance gates take the product to the destination?

The answer must cover editor/runtime boundaries, renderer route and sidebar composition, persistence and IPC/schema changes, locale updates, migration rollout, focused verification, and Electron end-to-end scenarios. It must distinguish destructive migration acceptance from ordinary feature behavior and state when execution can begin without reopening architecture decisions.

## Answer

The implementation sequence is dependency-ordered and each phase must leave the non-learning application diagnosable:

### 05A. Domain and architecture records

- Revise ADR 0006 so Highlight is an Extract/Reading Item source and does not automatically create a CardTopic; explicit Card generation remains the CardTopic boundary.
- Keep the glossary terms `Incremental Learning`, `Reading Item`, `Highlight`, `CardTopic`, and `Review Target` consistent with the resolved model.
- Define the new Reading Item contracts around `sourceBlockId + highlightId`, processing state, priority, next-process time, and progress metadata. Do not add a copied content snapshot for the initial implementation.

Gate: domain types and invariants are explicit; no implementation code still relies on “every Highlight creates a CardTopic” as an architectural assumption.

### 05B. Learning storage and queue

- Replace the current learning schema/contracts directly in the unreleased development path. Do not change `user_version` or `learningSchemaGeneration`, add migration code, or add compatibility aliases.
- Add Reading Item persistence, Highlight reference validation, cascade deletion, processing actions, priority/next-process updates, and a unified queue comparator.
- Keep FSRS scheduling and Review Target history as a separate state machine. Enforce hard due Review Target priority, fair interleaving, global/current-Note scope, stable route identity, and explicit semantic scheduling actions.
- Fail storage initialization explicitly when the edited schema cannot open; never substitute an empty queue.

Gate: clean storage initialization, deterministic queue ordering, cascade behavior, edit-without-reschedule, semantic-action scheduling, and explicit initialization failure are covered by focused storage/domain tests.

### 05C. Editor projection and Highlight/Extract behavior

- Change inline and whole-block Highlight commands/projections so Highlight identity is the Extract identity.
- Remove automatic Highlight CardTopic reconciliation. Add an explicit Card-generation command that can create a CardTopic from a Highlight/Reading Item when requested.
- Preserve stable Block/Highlight identity across ordinary content edits and ensure Learning edits write through to the source Topic.
- Verify Card projection updates when a referenced Highlight changes, and Reading Item cascade deletion when its Block or Highlight disappears.

Gate: editor tests cover inline/whole-block Highlight, edits, deletion, explicit Card generation, nested sources, collaboration receipts, and no accidental CardTopic creation.

### 05D. Main/preload/API workflow

- Extend public Learning contracts and IPC for Reading Item listing, selection, processing actions, source editing/flush, explicit Card generation, and unified queue positions.
- Preserve existing Note persistence ownership and configuration boundaries; no new global event bus or local draft store.
- Return structured errors for missing/deleted Highlights, unsupported Topic surfaces, failed flushes, and invalid queue positions.

Gate: main/preload tests verify request/response schemas, source write-through, cascade visibility, queue restoration, and error propagation.

### 05E. Renderer Learn workspace

- Replace the rendering subtree of `/learning/review` with the Variant B reading-first canvas and right Note Structure rail while retaining global/current-Note scope.
- Keep the editor mounted and always editable. Auto-save content, but do not reschedule on typing, idle, leaving, closing, or plain navigation.
- Make Highlight/Extract, Make Cloze, and Next the explicit semantic actions that may advance Reading Item processing. Keep Reveal/Rating isolated to Review Targets.
- Implement the feature-owned Note Structure rail using existing NoteEntry projection and public Sidebar primitives. Support complete hierarchy, folder disclosure, dual active/source markers, Topic/CardTopic context switching, special-topic status, flush-before-switch, save-failure blocking, and narrow-screen sheet behavior.
- Update all supported learning locale bundles in structural lockstep.

Gate: renderer/component tests cover auto-save without reschedule, semantic actions, Reveal/Rating separation, sidebar keyboard/focus behavior, dual markers, flush failure, collaboration updates, and narrow layout.

### 05F. End-to-end and rollout verification

- Run focused package lint, typecheck, and tests after each phase; no separate test-only ticket is needed, but the listed invariants are mandatory.
- Run Electron E2E with `MEMORILO_E2E_HIDE_WINDOW=1` for Note content write-through, Highlight-as-Extract, Card generation, global/current-Note queue scope, route restoration, restart behavior, and explicit storage failure.
- Before execution is considered complete, run repository-required `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Run `pnpm test:e2e` because Learning startup, IPC, persistence, and user workflows change.

### Acceptance summary

- Learning Review is one editable SuperMemo-style workspace, not a parallel legacy route.
- Highlight is the Extract and Reading Item source; it does not silently produce a CardTopic.
- Content edits are persistent and independent from scheduling; only semantic learning actions schedule.
- Reading Items and Review Targets share one fair queue but not one state machine or algorithm.
- The right Note Structure rail is navigable, accessible, stable during edits, and safe on save failure.
- Existing Note content is preserved; unreleased development learning data may be directly reshaped without version changes or compatibility code.
- The route is execution-ready only after ADR 0006 is updated and the focused tests above are planned alongside each implementation phase.
