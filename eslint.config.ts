import antfu from '@antfu/eslint-config'

export default antfu(
  {
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
  },
  {
    files: ['apps/desktop/renderer/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/app/**', '**/routes/**'],
          message: 'Renderer features receive route and application concerns through narrow props or shared interfaces.',
        }],
      }],
    },
  },
  {
    files: ['apps/desktop/renderer/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/app/**', '**/features/**', '**/routes/**'],
          message: 'Renderer shared modules must remain independent of application and feature implementations.',
        }],
      }],
    },
  },
)
