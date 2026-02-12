import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import tailwindcss from '@tailwindcss/postcss'
import postcss from 'rollup-plugin-postcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

const extensions = ['.js', '.jsx', '.ts', '.tsx']
const externalPackages = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
])

function isExternal(id) {
  if (id.startsWith('node:'))
    return true
  if (id.startsWith('.') || path.isAbsolute(id))
    return false
  const pkgName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]
  return externalPackages.has(pkgName) || builtinModules.includes(pkgName) || builtinModules.includes(id)
}

export default {
  input: 'src/editor.tsx',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: false,
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  external: isExternal,
  plugins: [
    postcss({
      autoModules: true,
      modules: {},
      inject: { insertAt: 'top' },
      extract: false,
      plugins: [tailwindcss()],
    }),
    nodeResolve({ extensions }),
    typescript({
      tsconfig: './tsconfig.json',
      declarationDir: 'dist/types',
      rootDir: 'src',
    }),
  ],
}
