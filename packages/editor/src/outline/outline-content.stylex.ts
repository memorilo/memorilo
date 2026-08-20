import inject from '@stylexjs/stylex/lib/stylex-inject'

const outlineContentRules = [
  '[data-editor-mode=\'outline\'] { --memorilo-outline-bullet-color: hsl(0deg 0% 78%); --memorilo-outline-bullet-ring-color: rgb(0 0 0 / 7.1%); }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker { display: flex; align-items: center; justify-content: center; background-color: transparent; mask-image: none; }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker::before, [data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker::after { position: absolute; display: block; flex: none; border-radius: 9999px; content: \'\'; }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker::before { z-index: 1; width: 0.4em; height: 0.4em; background-color: var(--memorilo-outline-bullet-color); opacity: 0.8; transition: transform 200ms; }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker::after { width: 1em; height: 1em; background-color: transparent; }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker:hover::before { transform: scale(1.2); }',
  '[data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\']) > .list-marker:hover::after, [data-editor-mode=\'outline\'] :is([data-list-kind=\'outline\'], [data-list-kind=\'bullet\'])[data-outline-view-collapsed] > .list-marker::after { background-color: var(--memorilo-outline-bullet-ring-color); }',
  '[data-editor-mode=\'outline\'] [data-outline-selected] { border-radius: 4px; background: #edf4ff; box-shadow: 0 0 0 1px #bfd6ff; }',
  '[data-editor-mode=\'outline\'] [data-outline-view-collapsed] > .list-content > [data-block-id] { display: none; }',
  '[data-editor-mode=\'outline\'] [data-outline-focus-ancestor] { margin-left: 0; }',
  '[data-editor-mode=\'outline\'] [data-outline-focus-ancestor] > .list-marker, [data-editor-mode=\'outline\'] [data-outline-focus-ancestor] > .list-content > :first-child, [data-editor-mode=\'outline\'] [data-outline-focus-ancestor] > [data-task-meta] { display: none !important; }',
  '[data-editor-mode=\'outline\'] [data-outline-focus-root] { margin-left: 0; }',
  '[data-editor-mode=\'outline\'][data-editor-outline-focus-presentation=\'content-only\'] [data-outline-focus-root] > .list-marker, [data-editor-mode=\'outline\'][data-editor-outline-focus-presentation=\'content-only\'] [data-outline-focus-root] > [data-task-meta] { display: none !important; }',
  '[data-editor-mode=\'outline\'] [data-block-id] > .list-marker { min-width: 1.25rem; min-height: 1.25rem; cursor: pointer; }',
]

for (const rule of outlineContentRules)
  inject({ ltr: rule, priority: 1 })
