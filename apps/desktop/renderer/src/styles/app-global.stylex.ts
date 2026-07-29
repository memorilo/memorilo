import inject from '@stylexjs/stylex/lib/stylex-inject'

const appGlobalRules = [
  ':root { color: #202124; background: transparent; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-synthesis: none; }',
  '* { box-sizing: border-box; }',
  'html, body, #root { width: 100%; height: 100%; }',
  'body { margin: 0; min-width: 720px; min-height: 100vh; overflow: hidden; }',
  ':is(button, input) { font-family: inherit; }',
  '[data-window-drag] { -webkit-app-region: drag; }',
  '[data-window-no-drag] { -webkit-app-region: no-drag; }',
]

for (const rule of appGlobalRules)
  inject({ ltr: rule, priority: 1 })
