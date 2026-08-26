# Editable Learning Interaction Contract

Type: prototype
Status: resolved
Blocked by: 01

## Question

What should the learning workspace look and feel like when the current Topic or Item is editable in place?

Produce a concrete prototype or wireframe that resolves:

- the split between editable content, active-recall reveal, answer/rating controls, and source context;
- whether edits are always enabled or entered through an explicit edit action;
- how editing affects reveal state, rating availability, card projection, and the next queue decision;
- keyboard focus, shortcuts, selection preservation, autosave/flush feedback, errors, and reduced-motion behavior;
- how the layout works at narrow widths and with the Note Structure sidebar visible.

The prototype must use the current editor and CardSurface vocabulary where they remain valid, and call out any boundary that requires a domain decision rather than a visual choice.

## Prototype

Throwaway UI prototype: [learning-workspace.html](../prototype/learning-workspace.html). Open it directly in a browser; switch variants with `?variant=A`, `?variant=B`, or `?variant=C`, or use the floating arrow control.

The three variants explore:

- A: persistent left Note Structure + central editable reading surface;
- B: reading-first canvas + right-side structure rail;
- C: centered context canvas with a compact structure panel beside the editor.

All mutations are in-memory stubs. The prototype intentionally demonstrates live source editing, Highlight-as-Extract feedback, semantic Next scheduling, reveal/rating, and interrupted-edit behavior without touching production persistence.

## Answer

Choose **Variant B — Reading focus + rail**. The production learning workspace should use a reading-first central canvas with the navigable Note Structure rail on the right, while keeping the learning dock anchored below the content.

Interaction contract:

- The current source content is always editable; there is no separate edit mode and no submit action for text changes.
- Edits auto-save/write through to the source Topic and expose lightweight save/error status without remounting the editor.
- Editing alone does not change `nextProcessAt`, processing state, or Review Target scheduling. Leaving the page, switching the sidebar selection, or closing the window also does not mark the Reading Item processed.
- Explicit semantic learning actions advance processing: Highlight/Extract, Make Cloze, and Next (when the learner chooses to move on) may write the next processing time/state. A plain navigation action must remain non-completing.
- Reveal and Rating remain separate from source editing. Rating is available only for a Review Target after reveal; editing a source does not implicitly rate it.
- Highlight/Extract immediately creates or updates the Reading Item representation and shows its status in the learning surface; Card generation remains an explicit later action.
- Variant B collapses the right rail below the reading surface at narrow widths. Keyboard focus remains in the editor during typing; sidebar navigation and dock controls have normal focus return and reduced-motion-safe transitions.

This resolves the UI decision but leaves the semantic definition of which actions count as a Reading Item processing event to the Learning Model ticket's rules above. Production implementation must add focused editor/renderer tests for auto-save without rescheduling, Highlight-as-Extract, navigation without completion, reveal/rating separation, and narrow-layout/sidebar focus behavior.
