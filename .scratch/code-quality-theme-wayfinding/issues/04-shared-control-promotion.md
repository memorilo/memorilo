# Shared Control Promotion and Component Boundaries

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

Which editor-owned controls should move into `packages/ui`, which should remain feature-specific, and what public component API replaces the current split implementations without creating a generic mega-component?

Evaluate the repeated button, form-control, popover/surface, segmented-control, calendar/date, menu, and dialog patterns. Decide extraction criteria based on stable semantics and multi-feature use, not file size alone. For each promoted control, specify:

- public API and composition model;
- style/token inputs and escape hatches;
- accessibility and interaction ownership;
- old API/files to delete;
- consumers that must migrate together.

Keep domain-specific task scheduling behavior in the task feature even when its visual primitives are promoted.

## Answer

Promote stable visual and interaction semantics into `packages/ui`; keep editor and feature behavior behind adapters. The promotion is based on semantic stability and multiple consumers, not file size.

### Promotion matrix

| Existing pattern | Target | Public seam | Keep local | Delete after migration | Migrate together |
| --- | --- | --- | --- | --- | --- |
| `@memorilo/ui` Button plus editor `buttonStyles.action` / `primaryButton` | `packages/ui` | Extend `Button` with semantic variants (`icon`, `primary`, `secondary`, etc.); `xstyle` remains a narrow escape hatch for layout and exceptional local geometry | ProseMirror focus-preserving click behavior and tooltip composition remain in editor `Button` adapter | Delete absorbed visual definitions from editor `button.stylex.ts`; retain only adapter-specific tooltip/focus styles in a private file | task panels/pickers, image upload form, inline menu, task list/menu, editor Button adapter |
| editor `formControlStyles.textInput` | `packages/ui` | Existing `TextField` owns `<input>` semantics and semantic field tokens | Task/repeat/date/time validation and labels remain feature-owned | Delete `form-controls.stylex.ts` text-input styles | task action/occurrence/reminder/time/repeat pickers, image upload form, inline menu |
| editor select styling | `packages/ui` | Add independent `SelectField` for `<select>`; do not add an `as="input|select"` mega-control | Option lists and task recurrence semantics remain feature-owned | Delete select uses of `form-controls.stylex.ts` | task repeat picker and any later shared select consumer |
| editor `formControlStyles.primaryButton` | `packages/ui` | Use `Button variant="primary"`; width/placement may be supplied with local `xstyle` | Submit/update behavior and disabled state ownership remain feature-owned | Delete `primaryButton` style | task panels/pickers and image upload form |
| repeated `floatingSurfaceStyles` positioner/motion/surface | split | Add public `Surface` for themed surface visuals and public `Popover` for anchored interaction; keep third-party positioner adapters only where they own editor lifecycle | ProseKit autocomplete/block-handle/menu positioners, task Floating UI wiring, placement policy, owner IDs, and feature geometry remain local adapters | Delete editor `floating-surface.stylex.ts` after all visual consumers use `@memorilo/ui` `Surface`/`Popover` styles | slash/tag/image-upload/inline/card/table/block-handle, task action/occurrence panels, editor Button tooltip |
| editor-owned ad-hoc anchored popovers | `packages/ui` | New Radix-shaped compound `Popover` described below | Task/repeat/reminder/time content and domain state remain in editor/task | Remove bespoke open/focus/dismiss plumbing only after each consumer migrates | task pickers, image upload popover, inline-menu link popover, and future anchored shared controls |
| `SegmentedControl`, `Dialog`, `DropdownMenu`, `ContextMenu`, `Toolbar`, `EditableTitle`, `Sidebar`, `Status`, `Switch`, `Tabs` | already public | Keep existing compound/public seams; migrate editor duplicates to these APIs | Editor action/clipboard/ProseMirror adapters remain local | Delete only duplicate wrappers/styles once consumers use public components | Existing editor consumers identified by import graph |
| calendar/date/repeat/reminder/time controls | keep feature-specific | No public calendar or recurrence component in this ticket | All task scheduling semantics, date math, locale rules, and validation stay in `editor/task` | None beyond absorbed visual primitives | Task feature only |

### Public Popover contract

`@memorilo/ui` adds a focused compound module modelled after Radix Popover, without exposing palette tokens:

```tsx
<Popover.Root open={open} onOpenChange={setOpen} modal={false}>
  <Popover.Trigger asChild>
    <Button variant="icon" />
  </Popover.Trigger>
  <Popover.Anchor /> // optional; defaults to Trigger
  <Popover.Portal>
    <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8}>
      ...feature content...
      <Popover.Close asChild><Button variant="icon" /></Popover.Close>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
```

Required behavior:

- controlled and uncontrolled open state, `onOpenChange`, and `defaultOpen`;
- `Trigger`/`Anchor` refs and `aria-controls`, `aria-expanded`, and `aria-haspopup="dialog"` wiring;
- portal rendering with SSR-safe fallback;
- collision-aware side/align positioning via a direct `@floating-ui/react` dependency of `@memorilo/ui`;
- outside-pointer and Escape dismissal, with cancellable `onPointerDownOutside`/`onEscapeKeyDown` hooks;
- focus return to the trigger, initial focus inside content, and a modal focus scope when `modal` is enabled;
- `forceMount`, `asChild`, `data-state`, and `data-side`/`data-align` attributes for StyleX and animation selectors;
- semantic `Content`/`Surface` variants and `xstyle` escape hatch, while positioner, portal, and business state remain owned by the module consumer only through composition.

The default migration setting for editor/task anchored controls is `modal={false}` to preserve non-blocking editing flows. Consumers that need a true modal form must opt into `modal` explicitly; no consumer relies on an implicit modal default.

`Surface` is a separate visual module. It owns border, background, radius, elevation, text, and reduced-motion/reduced-transparency/high-contrast token application, but never owns positioning, dismissal, or domain state. `Popover.Content` composes `Surface` internally by default and accepts a local `xstyle` for geometry.

### Ownership and accessibility

- `packages/ui` owns keyboard/focus/dismissal mechanics for public controls and their semantic ARIA wiring.
- Editor adapters own ProseMirror-specific focus preservation, tooltip text integration, clipboard/editor commands, and positioner APIs supplied by ProseKit.
- Features own labels, translations, validation, mutation state, and domain-specific interaction ordering.
- Every migrated surface must retain visible focus, keyboard Escape/outside dismissal, reduced-motion and reduced-transparency behavior, and high-contrast-readable states.

### Deletion and migration rule

This is a breaking migration. After all consumers move, delete `packages/editor/src/ui/form-controls/form-controls.stylex.ts`, remove absorbed visual definitions from `packages/editor/src/ui/button/button.stylex.ts`, and delete `packages/editor/src/ui/floating-surface/floating-surface.stylex.ts`. Any retained editor-private styles must be renamed to describe the adapter seam (`editor-button-adapter`, `editor-positioner-adapter`) and must not re-export a public-looking primitive API.

No compatibility aliases are required. A migration is complete only when no feature imports the deleted files and no feature passes palette-specific values to shared controls.

### Minimal acceptance for this ticket

- The matrix above is reflected in the implementation ticket sequence.
- `Popover` has one documented public compound API and no feature-specific props.
- All current shared-control consumers have an explicit migration owner; task/calendar semantics remain in editor/task.
- The old editor visual primitive files are scheduled for deletion after their final consumer migration.
