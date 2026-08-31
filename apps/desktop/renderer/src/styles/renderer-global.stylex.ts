import { injectGlobalStyle } from './inject-global-stylex'

// Global renderer rules stay at the renderer composition boundary so theme and
// accessibility selectors apply consistently across Electron windows.
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

[data-topic-type="whiteboard"] .App-menu_top__left {
  margin-top: 56px;
}

[data-topic-type="whiteboard"] .layer-ui__wrapper__top-right {
  margin-top: -6px;
}

[data-topic-type="whiteboard"] .shapes-section {
  margin-top: -6px;
}

[data-topic-type="whiteboard"] .excalidraw--mobile .App-toolbar--mobile {
  transform: translateX(32px);
}

[data-topic-type="whiteboard"] .App-toolbar-container,
[data-topic-type="whiteboard"] .App-toolbar {
  height: 36px;
}

/* Non-glass families do not use Liquid Glass material effects. */
:is(html[data-ui-theme-family="fluent"], html[data-ui-theme-family="neubrutalism"]) :is(
  button,
  input,
  select,
  textarea,
  [role="button"],
  [role="dialog"],
  [role="menu"],
  [data-ui],
  [data-editor-mode-picker]
) {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Shelf predates the runtime theme contract, so its chrome consumes the
 * unminified variables that the renderer updates when the family changes. */
main[aria-label="Shelf"] :is([data-ui="shelf-source-trigger"], [data-ui="shelf-search"]) {
  border: var(--ui-control-stroke) solid var(--ui-field-border) !important;
  border-radius: var(--ui-control-radius) !important;
  background: var(--ui-surface-translucent) !important;
  backdrop-filter: var(--ui-material-filter) !important;
  box-shadow: var(--ui-shadow-subtle) !important;
}

main[aria-label="Shelf"] [data-ui="shelf-source-trigger"]:hover {
  background: var(--ui-control-hover) !important;
}

main[aria-label="Shelf"] [data-ui="shelf-source-trigger"]:active {
  background: var(--ui-control-pressed) !important;
}

main[aria-label="Shelf"] [data-ui="shelf-source-trigger"]:focus-visible,
main[aria-label="Shelf"] [data-ui="shelf-search"]:focus-within {
  border-color: var(--ui-focus) !important;
  box-shadow: 0 0 0 2px var(--ui-focus) !important;
}

main[aria-label="Shelf"] [data-ui="shelf-search"]:focus-within {
  background: var(--ui-surface-raised) !important;
}

main[aria-label="Shelf"] [data-ui="shelf-search-clear"] {
  border-radius: var(--ui-control-radius) !important;
  background: var(--ui-control-pressed) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-source-trigger"] {
  border: 1px solid rgba(255, 255, 255, 0.68) !important;
  border-radius: 18px !important;
  background: rgba(246, 248, 251, 0.56) !important;
  backdrop-filter: blur(24px) saturate(175%) !important;
  box-shadow: 0 5px 14px rgba(27, 34, 44, 0.11), 0 1px 3px rgba(27, 34, 44, 0.07), inset 0 1px rgba(255, 255, 255, 0.82) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-source-trigger"]:hover {
  background: rgba(250, 251, 253, 0.68) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-source-trigger"]:active {
  background: rgba(226, 230, 237, 0.66) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-search"] {
  border: 1px solid rgba(255, 255, 255, 0.62) !important;
  border-radius: 17px !important;
  background: rgba(239, 242, 246, 0.58) !important;
  backdrop-filter: blur(24px) saturate(175%) !important;
  box-shadow: 0 5px 14px rgba(27, 34, 44, 0.1), 0 1px 3px rgba(27, 34, 44, 0.06), inset 0 1px rgba(255, 255, 255, 0.78) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-search"]:focus-within {
  border-color: rgba(0, 113, 227, 0.28) !important;
  background: rgba(250, 251, 253, 0.72) !important;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.16), 0 5px 14px rgba(27, 34, 44, 0.1), inset 0 1px rgba(255, 255, 255, 0.86) !important;
}

html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-search-clear"] {
  border-radius: 10px !important;
  background: rgba(61, 67, 77, 0.14) !important;
}

@media (prefers-reduced-transparency: reduce) {
  main[aria-label="Shelf"] :is([data-ui="shelf-source-trigger"], [data-ui="shelf-search"]) {
    backdrop-filter: none !important;
  }

  html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-source-trigger"] {
    background: rgb(245, 246, 248) !important;
  }

  html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] [data-ui="shelf-search"] {
    background: rgb(239, 240, 243) !important;
  }
}

@media (prefers-contrast: more) {
  html[data-ui-theme-family="liquid-glass"][data-ui-theme-resolved-appearance="light"] :is([data-ui="shelf-source-trigger"], [data-ui="shelf-search"]) {
    border-color: rgba(49, 54, 63, 0.5) !important;
    background: rgba(250, 250, 251, 0.96) !important;
  }
}

/* Neubrutalism is intentionally hard-edged; Fluent keeps its small rectangle radii. */
html[data-ui-theme-family="neubrutalism"] :is(
  button,
  input,
  select,
  textarea,
  [role="button"],
  [role="dialog"],
  [role="menu"],
  [data-ui],
  [data-editor-mode-picker]
) {
  border-radius: 0 !important;
}

/* NavigationView uses a single leading selection rail, not a full blue outline. */
html[data-ui-theme-family="fluent"] [data-ui="sidebar-item"][data-state="active"] {
  border-color: transparent !important;
  border-left-color: var(--ui-nav-selected-indicator) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [role="group"] {
  border-radius: 0 !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* The Todo secondary navigation uses the same structural grammar as the
 * primary Neubrutalism rail: thick boundaries, flat state color, hard depth. */
html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] {
  border-right: 3px solid var(--ui-border) !important;
  padding: 12px 10px 20px !important;
  background: var(--ui-surface) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] > section {
  margin-bottom: 20px;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] > section > :is(h3, button[aria-expanded]) {
  height: 30px;
  padding: 0 8px;
  color: var(--ui-text) !important;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] ul {
  gap: 6px;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] li > button {
  width: calc(100% - 4px);
  height: 34px;
  border: 2px solid transparent !important;
  padding: 0 8px;
  font-weight: 600;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] li > button:hover {
  border-color: var(--ui-border) !important;
  background: var(--ui-accent-soft) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] li > button[aria-current="page"] {
  border: 3px solid var(--ui-border) !important;
  background: var(--ui-accent) !important;
  box-shadow: 4px 4px 0 var(--ui-border) !important;
  color: var(--ui-on-accent) !important;
  font-weight: 800;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] li > button[aria-current="page"] span {
  color: inherit !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar] p {
  color: var(--ui-text-muted) !important;
  font-weight: 600;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-controls] {
  min-height: 52px;
  border-bottom: 3px solid var(--ui-border) !important;
  background: var(--ui-accent) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar-toggle] {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ui-border) !important;
  border-radius: 0 !important;
  background: var(--ui-surface) !important;
  box-shadow: none !important;
  color: var(--ui-text) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-sidebar-toggle][aria-pressed="true"] {
  background: var(--ui-surface) !important;
  color: var(--ui-text) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-controls] :is(h2, p) {
  color: var(--ui-on-accent) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-list-controls] h2 {
  font-size: 22px;
  font-weight: 900;
}

html[data-ui-theme-family="neubrutalism"] header [data-window-title-text] {
  box-sizing: border-box;
  border: 3px solid var(--ui-border);
  padding: 3px 11px;
  background: var(--ui-accent);
  box-shadow: 3px 3px 0 var(--ui-border);
  color: var(--ui-on-accent);
  font-size: 14px;
  font-weight: 900;
  line-height: 16px;
}

/* Neubrutalism relies on visible offset shadows and physical button states. */
html[data-ui-theme-family="neubrutalism"] [data-editor-mode-picker] button {
  border-color: #000 !important;
  box-shadow: 5px 5px 0 #000 !important;
  font-weight: 700;
}

html[data-ui-theme-family="neubrutalism"] [data-editor-mode-picker] button:first-child {
  background: #ffd23f !important;
}

html[data-ui-theme-family="neubrutalism"] [data-editor-mode-picker] button:nth-child(2) {
  background: #74b9ff !important;
}

html[data-ui-theme-family="neubrutalism"] [data-editor-mode-picker] button:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 #000 !important;
}

html[data-ui-theme-family="neubrutalism"] [data-editor-mode-picker] button:active {
  transform: translate(4px, 4px);
  box-shadow: none !important;
}

/* Window chrome is a command strip, so it stays flatter than content cards. */
html[data-ui-theme-family="neubrutalism"] header [data-ui="button-group"][data-variant="glass"]:not([data-titlebar-appearance="plain"]) {
  height: 32px;
  gap: 3px;
  padding: 0;
  border-width: 0;
  background: transparent;
  box-shadow: none;
}

html[data-ui-theme-family="neubrutalism"] header [data-ui="button-group"][data-variant="glass"]:not([data-titlebar-appearance="plain"]) button,
html[data-ui-theme-family="neubrutalism"] [data-sidebar-toggle] {
  border: 2px solid var(--ui-border) !important;
  background: var(--ui-surface) !important;
  box-shadow: none !important;
  color: var(--ui-text) !important;
}

/* TODO view commands are a separate square command strip, not a nested glass group. */
html[data-ui-theme-family="neubrutalism"] header [data-titlebar-appearance="plain"] {
  height: 36px;
  gap: 4px;
  padding: 0;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

html[data-ui-theme-family="neubrutalism"] header [data-titlebar-appearance="plain"] button {
  width: 32px;
  height: 32px;
  border: 2px solid var(--ui-border) !important;
  border-radius: 0 !important;
  background: var(--ui-surface) !important;
  box-shadow: none !important;
  color: var(--ui-text) !important;
}

html[data-ui-theme-family="neubrutalism"] header [data-titlebar-appearance="plain"] button[aria-pressed="true"] {
  background: var(--ui-accent) !important;
  color: var(--ui-on-accent) !important;
}

html[data-ui-theme-family="neubrutalism"] [data-journal-scroll-edge] {
  box-shadow: none !important;
}

html[data-ui-theme-family="liquid-glass"] [data-journal-scroll-edge] {
  box-shadow: none !important;
  -webkit-mask-image: linear-gradient(to bottom, #000 0 72%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0 72%, transparent 100%);
}

/* Liquid Glass keeps the Todo list rail and heading in one continuous material.
 * The hard borders belong to the denser desktop families, not the glass surface. */
html[data-ui-theme-family="liquid-glass"] main[aria-label="Todo"] [data-todo-list-sidebar] {
  border-right: 0 !important;
  background: var(--ui-sidebar-background) !important;
  backdrop-filter: var(--ui-material-filter) !important;
  -webkit-backdrop-filter: var(--ui-material-filter) !important;
  box-shadow: 12px 0 28px rgba(26, 32, 42, 0.06) !important;
}

html[data-ui-theme-family="liquid-glass"] main[aria-label="Todo"] [data-todo-list-controls] {
  border-bottom: 0 !important;
  background: transparent !important;
}

/* Keep Liquid Glass window commands on their own material contract. */
html[data-ui-theme-family="liquid-glass"] header [data-ui="button-group"][data-variant="glass"]:not([data-titlebar-appearance="plain"]) {
  height: 36px;
  gap: 0;
  padding: 1px;
  border: var(--ui-control-stroke) solid var(--ui-field-border);
  border-radius: var(--ui-pill-radius);
  background: var(--ui-surface-translucent);
  backdrop-filter: var(--ui-material-filter);
  box-shadow: var(--ui-shadow-subtle);
}

html[data-ui-theme-family="liquid-glass"] header [data-ui="button-group"][data-variant="glass"]:not([data-titlebar-appearance="plain"]) button {
  border: 0 !important;
  border-radius: var(--ui-pill-radius) !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* Vendor and integration surfaces do not consume shared tokens, but still
 * need the non-glass material contract in Fluent. */
:is(html[data-ui-theme-family="fluent"], html[data-ui-theme-family="neubrutalism"]) :is(
  .memorilo-toast,
  .memorilo-toast::before,
  [data-editor-content] [data-card-hover-controls],
  [data-editor-content] [data-card-definition-scope],
  [data-editor-content] [data-card-material],
  [data-todo-time-grid-calendar] .fc-timegrid-event,
  [data-topic-type="whiteboard"] .App-toolbar-container,
  [data-topic-type="whiteboard"] .App-toolbar
) {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

html[data-ui-theme-family="neubrutalism"] :is(
  .memorilo-toast,
  .memorilo-toast::before,
  [data-editor-content] [data-card-hover-controls],
  [data-editor-content] [data-card-definition-scope],
  [data-editor-content] [data-card-material],
  [data-todo-time-grid-calendar] .fc-timegrid-event,
  [data-topic-type="whiteboard"] .App-toolbar-container,
  [data-topic-type="whiteboard"] .App-toolbar
) {
  border-radius: 0 !important;
}

[data-topic-type="whiteboard"] .App-toolbar {
  --lg-button-size: 32px;
  --padding: 0 !important;
  padding: 1px;
  border-radius: 18px;
}

/* FullCalendar is a third-party surface; keep its grid aligned with the renderer chrome. */
[data-todo-time-grid-view] {
  --todo-task: rgb(0, 122, 255);
  --todo-done: rgb(76, 130, 85);
  --todo-calendar: rgb(183, 112, 55);
  --fc-border-color: rgba(0, 122, 255, 0.12);
  --fc-button-bg-color: transparent;
  --fc-button-border-color: transparent;
  --fc-button-hover-bg-color: rgba(0, 122, 255, 0.1);
  --fc-button-hover-border-color: transparent;
  --fc-button-active-bg-color: rgba(0, 122, 255, 0.16);
  --fc-button-active-border-color: transparent;
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: rgba(0, 122, 255, 0.028);
  --fc-today-bg-color: rgba(0, 122, 255, 0.045);
  --fc-now-indicator-color: rgb(212, 58, 55);
  --fc-small-font-size: 11px;
  font-size: 13px;
}

[data-todo-time-grid-calendar],
[data-todo-time-grid-calendar] > .fc {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}

[data-todo-time-grid-calendar] > .fc {
  overflow: hidden;
  color: rgba(43, 40, 68, 0.76);
  font-family: inherit;
  background: rgb(255, 255, 255);
}

[data-todo-time-grid-calendar] .fc-scrollgrid {
  width: 100%;
  overflow: hidden;
  border-width: 0 0 1px;
  background: rgb(255, 255, 255);
}

[data-todo-time-grid-calendar] .fc-timegrid-col,
[data-todo-time-grid-calendar] .fc-timegrid-slot-lane {
  background: rgb(255, 255, 255);
}

[data-todo-time-grid-calendar] .fc-col-header-cell-cushion,
[data-todo-time-grid-calendar] .fc-timegrid-slot-label-cushion {
  color: rgba(60, 60, 67, 0.7);
  font-size: 11px;
  font-weight: 600;
}

[data-todo-time-grid-calendar] .fc-timegrid-slot {
  height: var(--todo-time-grid-slot-height, 1.7em);
}

[data-todo-time-grid-calendar] .fc-timegrid-axis {
  width: 56px;
}

[data-todo-time-grid-calendar] .fc-timegrid-event {
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(54, 46, 84, 0.16), inset 0 1px rgba(255, 255, 255, 0.28);
}

/* TODO view family contract. The view implementations share semantic tokens;
 * these hooks style their third-party/grid internals without coupling to
 * generated StyleX class names. */
main[aria-label="Todo"] [data-todo-view] {
  --todo-view-border: var(--ui-divider, rgba(60, 60, 67, 0.12));
  --todo-view-surface: var(--ui-surface, rgb(255, 255, 255));
  --todo-view-text: var(--ui-text, rgba(28, 28, 30, 0.94));
  --todo-view-muted: var(--ui-text-muted, rgba(60, 60, 67, 0.64));
  --todo-view-quiet: var(--ui-text-quiet, rgba(60, 60, 67, 0.46));
  color: var(--todo-view-text);
}

main[aria-label="Todo"] [data-todo-view] :is(button, select) {
  font-family: inherit;
}

html[data-ui-theme-family="fluent"] main[aria-label="Todo"] [data-todo-view] {
  --todo-accent-background-image: none;
  --todo-card-background-image: none;
  --todo-control-background-image: none;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-view] {
  --todo-accent-background-image: none;
  --todo-calendar-grid-gap: 2px;
  --todo-card-background-image: none;
  --todo-control-background-image: none;
  --todo-quadrant-grid-gap: 2px;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-view] :is(h1, h2, [role="heading"]) {
  color: var(--ui-text) !important;
  font-weight: 800 !important;
}

html[data-ui-theme-family="fluent"] main[aria-label="Todo"] [data-todo-view="board"] section,
html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-view="board"] section {
  background: var(--ui-surface) !important;
  background-image: none !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] > .fc,
html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-scrollgrid,
html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-col,
html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-slot-lane {
  background: var(--ui-surface) !important;
  border-color: var(--ui-border) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-slot-minor {
  border-top-color: color-mix(in srgb, var(--ui-border) 42%, transparent) !important;
}

html[data-ui-theme-family="neubrutalism"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-event {
  border: 2px solid var(--ui-border) !important;
  border-radius: 0 !important;
  background: var(--ui-accent) !important;
  box-shadow: 2px 2px 0 var(--ui-border) !important;
  color: var(--ui-on-accent) !important;
}

html[data-ui-theme-family="fluent"] main[aria-label="Todo"] [data-todo-time-grid-calendar] :is(.fc, .fc-scrollgrid, .fc-timegrid-col, .fc-timegrid-slot-lane) {
  background: var(--ui-surface) !important;
  border-color: var(--ui-divider) !important;
}

html[data-ui-theme-family="fluent"] main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-event {
  border-radius: var(--ui-control-radius, 4px) !important;
  background: var(--ui-accent) !important;
  box-shadow: var(--ui-control-shadow, 0 1px 2px rgba(0, 0, 0, 0.08)) !important;
  color: var(--ui-on-accent) !important;
}

/* FullCalendar's defaults are opaque white/blue. Rebind them for every
 * theme, including dark appearance, at the integration boundary. */
main[aria-label="Todo"] [data-todo-time-grid-view] {
  --todo-task: var(--ui-accent);
  --todo-done: var(--ui-status-success);
  --todo-calendar: var(--ui-warning);
  --fc-border-color: var(--ui-divider);
  --fc-button-bg-color: transparent;
  --fc-button-border-color: transparent;
  --fc-button-hover-bg-color: var(--ui-control-hover);
  --fc-button-active-bg-color: var(--ui-control-pressed);
  --fc-page-bg-color: var(--ui-surface);
  --fc-neutral-bg-color: var(--ui-surface-sunken);
  --fc-today-bg-color: var(--ui-accent-soft);
  --fc-now-indicator-color: var(--ui-danger);
}

main[aria-label="Todo"] [data-todo-time-grid-calendar] > .fc,
main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-scrollgrid,
main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-col,
main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-slot-lane {
  background: var(--ui-surface) !important;
  color: var(--ui-text) !important;
}

main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-col-header-cell-cushion,
main[aria-label="Todo"] [data-todo-time-grid-calendar] .fc-timegrid-slot-label-cushion {
  color: var(--ui-text-muted) !important;
}
`)
