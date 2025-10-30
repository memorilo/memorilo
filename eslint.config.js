import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  ignores: ['dist/**', 'node_modules/**', 'build/**', '.direnv/**', 'src-tauri/target/**'],
})
