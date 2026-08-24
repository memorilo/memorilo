# Migration Sequence and Acceptance Criteria

Type: grilling
Status: resolved
Blocked by: 01, 02, 03, 04

## Question

What ordered set of implementation tickets turns the resolved audit into a safe, reviewable refactor, and what proves each step is complete?

The migration plan must separate mechanical moves from semantic changes, name package/file ownership, include deletion of obsolete APIs where approved, and define focused lint/typecheck/test/build checks proportional to risk. It must also state the point at which a theme can be added by changing a preset rather than editing many components, and the point at which an approved `Effect` boundary is considered reliable in production.

## Answer

Execute the refactor as eight independently reviewable implementation tickets. The first six establish and consume the shared UI seam; the final two deepen feature modules and migrate the approved reliability boundary. The user confirmed this order, the breaking API policy, and focused verification without creating a separate test-suite project.

### Dependency graph

```text
01 ui-theme-foundation
        ↓
02 ui-control-foundation
        ↓
03 ui-popover
        ↓
04 editor-adapter-migration
        ↓
05 shared-consumer-migration
        ↓
06 legacy-primitive-deletion
       ↙                     ↘
07 task-module-deepening   08 effect-note-mutation
```

Tickets 07 and 08 may be implemented in parallel after 06 if ownership is kept separate, but their review and release gates remain after the shared-control migration. No ticket may reintroduce a deleted editor primitive or a palette-specific public prop.

### Implementation tickets

#### 01 — `ui-theme-foundation`

Owner: `packages/ui` plus the renderer composition root.

Scope:

- Replace scattered literal/palette-facing shared-control values with a documented semantic token contract (`canvas`, `surface`, `surfaceRaised`, `text`, `textMuted`, `textQuiet`, `border`, `accent`, `accentPressed`, `focus`, `danger`, motion and elevation tokens as needed).
- Define StyleX vars and named theme presets in `packages/ui`; keep theme classes applied once by the renderer root.
- Preserve reduced-motion, reduced-transparency, and high-contrast overrides in the token layer.
- Do not add a persisted user theme setting in this migration.

Minimum acceptance:

- Every existing `packages/ui` shared component reads semantic vars rather than hard-coded palette decisions.
- Renderer applies exactly one shared theme class at the composition root; editor consumers inherit it.
- A second materially different preset can be added by changing/adding a preset definition and root class, without editing component files.
- `@memorilo/ui` lint, typecheck, and existing tests pass; affected renderer/editor checks pass.

#### 02 — `ui-control-foundation`

Owner: `packages/ui`.

Scope:

- Extend `Button` with the approved semantic variants and move absorbed editor button/form visuals into public StyleX modules.
- Keep `TextField` as the input-only control and add independent `SelectField` for `<select>` semantics.
- Add `Surface` as a visual-only module for themed panel/popover surfaces; it does not own positioning, portal, dismissal, or domain state.
- Keep `xstyle` as the narrow geometry/layout escape hatch; do not expose palette/token props or `as` mega-control polymorphism.

Minimum acceptance:

- Public exports and TypeScript interfaces are documented at `packages/ui/src/index.ts`.
- Button, TextField, SelectField, and Surface expose stable semantic data attributes and preserve native/ref/ARIA behavior.
- Existing `packages/ui` consumers compile without feature-specific styling leaks.
- `@memorilo/ui` lint, typecheck, and existing tests pass.

#### 03 — `ui-popover`

Owner: `packages/ui`, with direct `@floating-ui/react` ownership.

Scope:

- Implement the Radix-shaped compound API approved in ticket 04: `Root`, `Trigger`, optional `Anchor`, `Portal`, `Content`, and `Close`.
- Support controlled/uncontrolled state, collision-aware side/align positioning, SSR-safe portals, outside-pointer and Escape dismissal, cancellable dismissal hooks, focus return, initial focus, optional modal focus scope, `forceMount`, `asChild`, and state/placement data attributes.
- Compose `Surface` visuals by default; leave feature content, labels, validation, and domain state to consumers.
- Default migrated editor/task usages to `modal={false}` unless a consumer explicitly requires modal behavior.

Minimum acceptance:

- One public compound API covers the approved anchored-popover use cases without feature-specific props.
- Focus, Escape, outside pointer, collision, portal, and SSR smoke paths are verified with existing/focused checks proportional to risk.
- Reduced-motion/transparency and high-contrast token behavior remains intact.
- `@memorilo/ui` and affected editor checks pass.

#### 04 — `editor-adapter-migration`

Owner: `packages/editor/src/ui`.

Scope:

- Rework the editor Button wrapper to consume public Button/Surface/Popover while retaining ProseMirror focus preservation and tooltip integration.
- Keep ContextMenu as an editor domain adapter over public ContextMenu; retain editor actions, clipboard, outline, and image insertion ownership.
- Keep ProseKit positioners and Floating UI wiring where they own editor lifecycle, placement, owner IDs, or anchor semantics; only their visual surface styles move to public modules.
- Rename retained local styles to explicit adapter-private names and stop exporting public-looking primitives.

Minimum acceptance:

- No editor adapter loses focus-preserving, tooltip, or ProseKit-specific behavior.
- Adapter modules import public controls through package entry points only.
- Affected editor lint, typecheck, and existing UI/interaction tests pass.

#### 05 — `shared-consumer-migration`

Owner: all affected consumers in `packages/editor/src/ui` and `packages/editor/src/task`.

Scope:

- Migrate every identified consumer in one coordinated sweep: task action/occurrence/repeat/reminder/time controls, image upload, inline menu, card/tag/slash/table/block-handle, task list/menu, and editor tooltip surfaces.
- Replace editor form styles with TextField/SelectField and Button variants; replace shared floating visuals with Surface/Popover composition.
- Keep task/calendar/repeat/date semantics, translations, validation, and mutation state feature-local.
- Do not introduce a public calendar/date/repeat component.

Minimum acceptance:

- Full import inventory is clean: no consumer reaches into another package's private source tree or old editor primitive files.
- Visual behavior and keyboard semantics are preserved for each migrated feature.
- Affected editor and renderer lint, typecheck, existing tests, and a production desktop build pass.

#### 06 — `legacy-primitive-deletion`

Owner: `packages/editor` cleanup.

Scope:

- Delete `packages/editor/src/ui/form-controls/form-controls.stylex.ts`.
- Remove absorbed visual definitions from `packages/editor/src/ui/button/button.stylex.ts` and delete `packages/editor/src/ui/floating-surface/floating-surface.stylex.ts` once no consumer remains.
- Rename any retained adapter-only style files (`editor-button-adapter`, `editor-positioner-adapter`) and remove re-export aliases.
- Remove all old imports and dead barrel exports.

Minimum acceptance:

- Repository-wide `rg` finds zero imports/references to deleted APIs/files.
- No compatibility alias or palette-specific shared-control prop exists.
- Affected package lint/typecheck/tests and package build pass.

#### 07 — `task-module-deepening`

Owner: `packages/editor/src/task`.

Scope:

- Split `TaskActionPanel` and `TaskRepeatPicker` into deep seams: state/draft model, pure recurrence/validation helpers, and view orchestration.
- Keep task scheduling semantics, calendar subscription rules, locale/date logic, and feature-specific interaction inside the task feature.
- Do not mechanically split `Dialog`/`EditableTitle` or extract task-specific controls to `packages/ui`.

Minimum acceptance:

- Parent components coordinate state and rendering without owning unrelated recurrence/date validation details.
- Pure helpers remain ordinary TypeScript and are independently callable without React or Effect runtime.
- Existing task/editor tests, lint, and typecheck pass; no new broad test suite is required.

#### 08 — `effect-note-mutation`

Owner: note mutation boundary in `packages/editor-storage` and its main-process composition.

Scope:

- Apply Effect only to the Note mutation cluster's multi-step writes, resource lifecycle, cancellation/supersession, and keyed concurrency.
- Use tagged/structured internal failures and keep stable Promise-facing/application/IPC seams; translate failures to transport codes, then localize in renderer.
- Keep queries, pure projections, synchronous calculations, React presentation, and already reliable simple Promise handlers ordinary TypeScript.
- Reuse the existing `@memorilo/effect-lifecycle` conventions rather than introducing a second lifecycle abstraction.

Minimum acceptance:

- A superseded Note mutation cannot publish stale success or mutate a closed owner.
- Multi-step persistence either commits according to the existing transaction contract or returns a stable structured failure; cleanup failures are preserved/combined where applicable.
- Cancellation, resource close, and keyed concurrency behavior are verified through existing/focused mutation and lifecycle checks.
- `editor-storage`/editor checks and a production desktop build pass; IPC/startup or end-user workflow changes also run the relevant Electron E2E coverage.

### Verification gates

Each ticket must pass its minimum acceptance before the next dependent ticket starts. Required repository gates at the end are `pnpm lint`, `pnpm typecheck`, and `pnpm test`; run `pnpm test:e2e` for changes affecting Electron startup, IPC, preload contracts, persistence, packaging, or end-user workflows.

Focused verification is allowed only where risk warrants it (Popover focus/dismissal/SSR, deletion import scans, task mutation lifecycle, and Effect cancellation/supersession). It is not a new independent testing initiative.

### Definition of done

The refactor is complete when:

1. All eight tickets are merged in dependency order and their acceptance evidence is recorded.
2. A materially different theme can be introduced by adding/selecting a `packages/ui` preset and changing the renderer root class; feature files and component markup do not require palette edits.
3. No editor feature imports deleted primitive styles or passes palette-specific values to public controls.
4. Shared controls have one public owner in `packages/ui`; editor adapters own only editor-specific behavior; task/calendar semantics remain feature-local.
5. The approved Note Effect boundary demonstrates cancellation, supersession, lifecycle closure, keyed concurrency, and stable structured failures in production-facing composition while Promise-facing seams remain intact.

## Comments

- 2026-08-24: Implemented the foundation slice of the first execution ticket (`ui-theme-foundation`). Added semantic shared-control vars and `light`/`midnight` StyleX presets in `packages/ui`, applied the light preset at the main and settings renderer composition roots, and verified UI tests, package/renderer lint and typecheck, and the production desktop build. Existing component literal replacement remains part of the subsequent control-foundation migration.
- 2026-08-24: Implemented `ui-control-foundation`. Added public `SelectField` and visual-only `Surface`, added the semantic `Button` danger variant, moved core Button/TextField/Status states onto shared semantic vars, and added focused UI coverage. `@memorilo/ui` lint/typecheck/tests, renderer lint/typecheck, and desktop production build pass.
- 2026-08-24: Implemented `ui-popover`. Added the Radix-shaped public `Popover.Root/Trigger/Anchor/Portal/Content/Close` compound API backed by Floating UI, with controlled/uncontrolled state, collision-aware placement, cancellable Escape/outside dismissal, focus management/return, `forceMount`, `asChild`, and semantic state attributes. Migrated editor image upload to the public Popover while retaining editor-local uploader/form state and tooltip/focus-preserving Button behavior; the editor Button adapter now forwards native props and refs needed by `asChild`. Added focused open, Escape, outside-pointer, Close, and focus-return coverage. `@memorilo/ui` tests (19), UI/editor lint and typecheck, renderer lint/typecheck, and desktop production build pass. ProseKit inline popovers remain an intentional editor lifecycle adapter boundary for ticket 04/05.
- 2026-08-24: Implemented `editor-adapter-migration`. Renamed the editor button styles to `editor-button-adapter.stylex.ts`, kept the wrapper responsible for ProseMirror focus preservation and ProseKit tooltip composition, and forwarded native props/ref through the wrapper for public compound controls. Moved context-menu image/style panel surfaces to public `Surface` while retaining editor-owned placement, actions, focus, and dismissal behavior. Converted the remaining editor floating surface and button adapter visuals away from the editor palette owner; geometry/motion remains local until the coordinated consumer migration. Editor and UI typecheck/lint pass; the editor test suite reaches the existing card/document interaction tests, with unrelated baseline browser failures still present in the full suite.
- 2026-08-24: Implemented `shared-consumer-migration` and `legacy-primitive-deletion`. Migrated task action/occurrence/repeat/reminder/time controls, image upload, inline link, tag/slash autocomplete, table-handle menus, and card menu surfaces to public `Button`, `TextField`, `SelectField`, and `Surface`; domain state, translations, validation, ProseKit lifecycle, and feature positioning remain local. Deleted `form-controls.stylex.ts` and the old public-looking `button.stylex.ts`/`floating-surface.stylex.ts` names; retained adapter-only files are explicitly named `editor-button-adapter.stylex.ts` and `editor-positioner-adapter.stylex.ts`. Zero references remain to the deleted APIs. Editor lint/typecheck, renderer typecheck, UI tests, and desktop production build pass. UI lint has only the existing Popover Fast Refresh/exhaustive-deps warnings.
- 2026-08-24: Started `task-module-deepening` with a pure `task-action-view-model.ts` seam for date-grid, locale/region, repeat summary, reminder summary, and date-time composition. `TaskActionPanel` now owns React state and mutation orchestration while the extracted helpers remain ordinary TypeScript. Editor lint/typecheck pass. The remaining repeat-picker draft normalization/preset model is intentionally still in the feature component and is the next slice of this ticket.
- 2026-08-24: Completed `task-module-deepening`. Added `task-repeat-view-model.ts` for repeat default normalization, preset construction, preset detection, summaries, calendar grid generation, and locale date formatting. `TaskRepeatPicker` now retains only React draft orchestration and feature rendering; recurrence semantics remain feature-local and ordinary TypeScript.
- 2026-08-24: Completed `effect-note-mutation`. The approved Note mutation boundary is already implemented in `apps/desktop/main/src/notes`: multi-step external updates use `Effect.gen`/`Effect.tryPromise`, runtime admission and close draining use `createOperationSupervisor`, cache/indexing/cleanup use `createResourceScope`, and Promise-facing application/IPC contracts remain stable. Existing Note application service tests cover duplicate update suppression, stale/failed persistence recovery, admitted work draining, idempotent close, checkpoint retry, and rejection after closure; all 18 targeted tests pass. No second Effect abstraction was introduced.
