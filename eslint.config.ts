import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: false,
  react: true,
  typescript: true,
  ignores: [
    '**/coverage/**',
    '**/dist/**',
    '**/out/**',
    '**/.output/**',
    '**/.turbo/**',
    '**/routeTree.gen.ts',
  ],
})
