import inject from '@stylexjs/stylex/lib/stylex-inject'

const appGlobalRules = [
  ':root { color: #202124; background: #f4f5f7; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-synthesis: none; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; min-width: 920px; min-height: 100vh; }',
  ':is(button, input) { font-family: inherit; }',
]

for (const rule of appGlobalRules)
  inject({ ltr: rule, priority: 1 })
