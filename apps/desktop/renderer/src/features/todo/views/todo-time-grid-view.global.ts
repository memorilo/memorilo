import { injectGlobalStyle } from '../../../styles/inject-global-stylex'

// FullCalendar does not expose StyleX slots. Keep its selector adapter beside
// the owning view and bind every visual value to the shared theme contract.
injectGlobalStyle(String.raw`
[data-todo-time-grid-view] {
  --todo-task: var(--ui-accent);
  --todo-done: var(--ui-status-success);
  --todo-calendar: var(--ui-warning);
  --fc-border-color: var(--ui-divider);
  --fc-button-bg-color: transparent;
  --fc-button-border-color: transparent;
  --fc-button-hover-bg-color: var(--ui-control-hover);
  --fc-button-hover-border-color: transparent;
  --fc-button-active-bg-color: var(--ui-control-pressed);
  --fc-button-active-border-color: transparent;
  --fc-page-bg-color: var(--ui-surface);
  --fc-neutral-bg-color: var(--ui-surface-sunken);
  --fc-today-bg-color: var(--ui-accent-soft);
  --fc-now-indicator-color: var(--ui-danger);
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
  color: var(--ui-text);
  font-family: inherit;
  background: var(--ui-surface);
}

[data-todo-time-grid-calendar] .fc-scrollgrid {
  width: 100%;
  overflow: hidden;
  border-width: 0 0 var(--ui-surface-stroke);
  border-color: var(--ui-divider);
  background: var(--ui-surface);
}

[data-todo-time-grid-calendar] .fc-timegrid-col,
[data-todo-time-grid-calendar] .fc-timegrid-slot-lane {
  border-color: var(--ui-divider);
  background: var(--ui-surface);
}

[data-todo-time-grid-calendar] .fc-timegrid-slot-minor {
  border-top-color: color-mix(in srgb, var(--ui-divider) 55%, transparent);
}

[data-todo-time-grid-calendar] .fc-col-header-cell-cushion,
[data-todo-time-grid-calendar] .fc-timegrid-slot-label-cushion {
  color: var(--ui-text-muted);
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
  border: var(--ui-control-stroke) solid var(--ui-border);
  border-radius: var(--ui-control-radius);
  background: var(--ui-accent);
  box-shadow: var(--ui-control-shadow);
  color: var(--ui-on-accent);
  backdrop-filter: var(--ui-material-filter);
}
`, 2)
