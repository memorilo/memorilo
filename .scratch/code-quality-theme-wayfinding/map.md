# Code Quality, Effect Boundaries, and Extensible Themes

Label: wayfinder:map

## Destination

Produce an execution-ready refactoring specification and migration ticket set for Memorilo's current codebase: reduce concrete code-quality liabilities, define the narrow effect-ts adoption boundary, and make shared controls extensible enough to support materially different themes without scattering visual decisions across features.

This map does not implement the refactor. It is complete when the remaining implementation work has explicit ownership boundaries, ordered migrations, compatibility decisions, and acceptance criteria.

## Notes

Domain: renderer UI, reusable editor controls, configuration, and reliability boundaries in the Electron monorepo.

Consult `codebase-design` for module boundaries and deep-module opportunities, `domain-modeling` when terminology or an architectural decision becomes durable, and `grilling` for unresolved human decisions. The user allows breaking changes, permits promoting genuinely shared UI across packages, and does not require a compatibility layer. Do not introduce effect-ts into pure presentation or pure synchronous calculations. Do not add tests as a separate scope item unless a migration's risk makes focused verification necessary.

Third-party/vendor source under `packages/excalidraw/excalidraw` is out of scope for quality scoring except where Memorilo's integration boundary is involved.

## Decisions so far

- [Audit Hotspots and Duplication](issues/01-audit-hotspots-and-duplication.md): Confirmed high-priority work is duplicate menu infrastructure, over-broad task workflow modules, two primitive systems, and fragmented visual tokens; large files alone, unproven dead code, and current renderer shared ownership are accepted for now.
- [Effect-TS Adoption Boundary](issues/02-effect-ts-boundary.md): Restrict Effect to multi-step mutations, resource lifecycle, cancellation/supersession, and keyed concurrency; keep pure/UI/query code ordinary TypeScript and translate structured failures at transport/UI seams.
- [Theme Contract and Token Ownership](issues/03-theme-contract-and-token-ownership.md): `packages/ui` owns the semantic shared-control tokens and StyleX presets; the full identified shared-control surface must migrate, while domain-specific and third-party styles stay local and theme settings remain deferred.
- [Shared Control Promotion and Component Boundaries](issues/04-shared-control-promotion.md): Promote stable Button/TextField/SelectField/Surface semantics and add a Radix-shaped public Popover; keep editor focus/positioner adapters and all task/calendar semantics local. Delete absorbed editor visual primitive APIs after consumer migration; no compatibility aliases.
- [Migration Sequence and Acceptance Criteria](issues/05-migration-sequence-and-acceptance.md): Execute eight ordered implementation tickets: theme foundation, public controls, Popover, editor adapters, all shared consumers, legacy deletion, task deepening, and the narrow Note Effect boundary. Each ticket has explicit ownership, dependencies, focused acceptance, and final repository gates.

## Not yet specified

None. The implementation order, ownership seams, deletion policy, theme extensibility point, Effect boundary, and acceptance gates are specified in issues 01–05.

## Out of scope

- Rewriting third-party Excalidraw internals.
- A user-facing arbitrary token editor or full theme marketplace.
- Converting React components and pure synchronous calculations to `Effect` solely for consistency.
- Implementing the refactor in this wayfinding effort.
