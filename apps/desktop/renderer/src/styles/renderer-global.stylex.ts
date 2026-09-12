import { injectGlobalStyle } from './inject-global-stylex'

// Renderer globals are limited to document setup, native window regions, and
// the user-wide motion preference. Theme visuals belong to semantic tokens and
// integration selectors live beside their owning feature.
injectGlobalStyle(String.raw`:root {
  background: transparent;
  font-family: var(--ui-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  overflow: hidden;
}

body[data-renderer="main"] {
  min-width: 720px;
  color: var(--ui-text, #202124);
  background: var(--ui-canvas, #ffffff);
}

body[data-renderer="settings"] {
  min-width: 320px;
  background: var(--ui-canvas, transparent);
  color: var(--ui-text, rgba(25, 27, 31, 0.92));
}

body[data-renderer="panel"] {
  min-width: 0;
  color: var(--ui-text, #202124);
  background: transparent;
}

:is(button, input, select) {
  font-family: inherit;
}

[data-window-drag] {
  -webkit-app-region: drag;
}

[data-window-no-drag] {
  -webkit-app-region: no-drag;
}

[data-reduce-motion="true"] *:not(.Toastify__progress-bar--animated),
[data-reduce-motion="true"] *::before,
[data-reduce-motion="true"] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
  transition-duration: 0.01ms !important;
}

@media (prefers-reduced-motion: reduce) {
  *:not(.Toastify__progress-bar--animated),
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`)
