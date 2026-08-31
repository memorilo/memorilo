import { injectGlobalStyle } from '../../styles/inject-global-stylex'

// The editor owns these internal descendants; injecting at the panel boundary
// keeps the layout override local without reintroducing a standalone CSS file.
injectGlobalStyle('[data-panel-root] [data-editor-content] { padding-inline: 22px; } [data-panel-root] [data-editor-mode-picker] { align-items: flex-start; padding: 12px 22px; } [data-panel-root] [data-editor-mode-picker] > [role="group"] { width: 100%; gap: 8px; } [data-panel-root] [data-editor-mode-picker] button { width: auto; height: 42px; flex: 1 1 0; flex-direction: row; gap: 7px; padding: 8px 10px; } [data-panel-root] [data-editor-mode-picker] button svg { width: 18px; height: 18px; } [data-panel-root] [data-editor-mode-picker] button span { font-size: 13px; line-height: 18px; }', 1)
