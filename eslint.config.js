import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  ignores: [
    'dist/**',
    'node_modules/**',
    'build/**',
    '.*/**',
    'src-tauri/target/**',
    'src-tauri/gen/**',
    '**/*.gen.ts',
  ],
})
