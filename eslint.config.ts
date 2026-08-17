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
      'apps/mobile/.expo/**',
      'apps/mobile/.generated/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/mobile/modules/**',
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
  {
    files: [
      'packages/ui/src/components/context-menu.tsx',
      'packages/ui/src/components/dialog.tsx',
      'packages/ui/src/components/dropdown-menu.tsx',
      'packages/ui/src/components/editable-title.tsx',
      'packages/ui/src/components/segmented-control.tsx',
      'packages/ui/src/components/sidebar.tsx',
      'packages/ui/src/components/tabs.tsx',
      'packages/ui/src/components/toolbar.tsx',
    ],
    rules: {
      // These files intentionally expose React components through compound namespaces.
      'react-refresh/only-export-components': 'off',
    },
  },
)
