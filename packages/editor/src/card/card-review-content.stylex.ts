import inject from '@stylexjs/stylex/lib/stylex-inject'

const cardReviewContentRules = [
  '[data-card-review-active] [data-card-review-hidden] { display: none !important; }',
  '[data-card-review-active] [data-card-review-source] { margin-left: 0; }',
  '[data-card-review-active] [data-card-review-source] > .list-marker { display: none; }',
  '[data-card-review-active] [data-card-review-source] > .list-content { min-width: 0; }',
  '[data-card-review-active] [data-card-review-item-hidden] > .list-content > :not([data-card-review-placeholder]) { display: none !important; }',
  '[data-card-review-active] [data-card-review-placeholder] { display: inline-flex; min-width: 2.6em; height: 1.45em; box-sizing: border-box; align-items: center; justify-content: center; border: 1px solid rgb(71 86 103 / 12%); border-radius: 6px; padding-inline: 0.45em; background: rgb(246 248 250 / 92%); color: rgb(47 57 68 / 58%); font-weight: 650; line-height: 1; vertical-align: baseline; }',
  '[data-card-review-active] [data-card-review-item-selectable] > .list-content { position: relative; min-height: 28px; padding-right: 34px; }',
  '[data-card-review-active] [data-card-review-item-selected] > .list-content { border-radius: 7px; background: rgb(191 54 51 / 7%); box-shadow: inset 0 0 0 1px rgb(169 46 43 / 10%); }',
  '[data-card-review-active] [data-card-review-item-toggle] { position: absolute; top: 0; right: 0; display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 7px; padding: 0; background: transparent; box-shadow: none; color: rgb(49 55 63 / 38%); cursor: default; outline: none; transition: background-color 100ms ease-out, color 100ms ease-out, transform 100ms ease-out; }',
  '[data-card-review-active] [data-card-review-item-toggle]:hover { background: rgb(61 68 77 / 7%); color: rgb(49 55 63 / 66%); }',
  '[data-card-review-active] [data-card-review-item-toggle]:active { background: rgb(61 68 77 / 11%); transform: scale(0.94); }',
  '[data-card-review-active] [data-card-review-item-toggle]:focus-visible { box-shadow: 0 0 0 2px rgb(0 96 204 / 36%); }',
  '[data-card-review-active] [data-card-review-item-toggle-selected] { color: rgb(180 52 48 / 82%); }',
  '@media (prefers-reduced-motion: reduce) { [data-card-review-active] [data-card-review-item-toggle] { transition-duration: 0ms; } }',
]

for (const rule of cardReviewContentRules)
  inject({ ltr: rule, priority: 2 })
