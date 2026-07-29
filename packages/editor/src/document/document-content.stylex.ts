import inject from '@stylexjs/stylex/lib/stylex-inject'

const documentContentRules = [
  '[data-editor-mode=\'document\'] [data-list-kind=\'outline\'] { margin-left: 0; }',
  '[data-editor-mode=\'document\'] [data-list-kind=\'outline\'] > .list-marker { display: none; }',
]

for (const rule of documentContentRules)
  inject({ ltr: rule, priority: 1 })
