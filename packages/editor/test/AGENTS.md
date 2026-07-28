# Editor test instructions

## React `act(...)` warnings in browser tests

Editor browser tests must not import `userEvent` directly from `@vitest/browser/context` or call a Vitest Browser locator's `.click()` method directly. Those operations are not wrapped in React `act()`, so ProseKit subscriptions can update `ViewRenderer`, menus, or table handles after the interaction has escaped the React test boundary.

Use `test/browser/user-event.ts` for clicks, keyboard input, and option selection. A `page` locator may be passed to this wrapper, but the interaction itself must go through the wrapper.

After an interaction, use `findBy*` or `waitFor` when the observable result is asynchronous. Do not suppress the React warning, disable the act environment, or filter `console.error`. The shared test setup intentionally fails a test when an update escapes `act()`.
