import inject from '@stylexjs/stylex/lib/stylex-inject'

const codeBlockContentRules = [
  '[data-editor-content].ProseMirror pre code { display: block; min-width: max-content; border-radius: 0; padding: 0; background: transparent; color: inherit; }',
  '[data-editor-content].ProseMirror pre { overflow-x: auto; }',
  '[data-editor-content].ProseMirror pre[data-language] { box-sizing: border-box; min-height: 96px; margin: 0; border: 1px solid rgb(255 255 255 / 8%); border-radius: 8px; padding: 36px 14px 12px; background: #1f2329; box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%); color: #abb2bf; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: 1.6; tab-size: 2; }',
  '[data-code-preview] svg { display: block; max-width: 100%; margin: auto; }',
]

for (const rule of codeBlockContentRules)
  inject({ ltr: rule, priority: 1 })
