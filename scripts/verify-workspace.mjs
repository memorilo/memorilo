import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  }
  catch (error) {
    if (error?.code === 'ENOENT')
      assert.fail(`Missing required workspace file: ${path}`)
    throw error
  }
}

const rootPackage = JSON.parse(await read('package.json'))
assert.equal(rootPackage.private, true)
assert.equal(rootPackage.type, 'module')
assert.equal(rootPackage.packageManager, 'pnpm@10.12.4')
assert.equal(rootPackage.license, 'AGPL-3.0-only')
assert.equal(rootPackage.engines?.node, '>=22.12.0')
assert.match(rootPackage.devDependencies?.typescript, /^\^5\.9\./)

for (const script of ['dev', 'build', 'lint', 'typecheck', 'test', 'test:e2e'])
  assert.equal(typeof rootPackage.scripts?.[script], 'string', `Missing root script: ${script}`)

const workspace = await read('pnpm-workspace.yaml')
for (const glob of ['apps/desktop', 'apps/desktop/*', 'packages/*'])
  assert.match(workspace, new RegExp(`^\\s*- ['"]?${glob.replaceAll('*', '\\*')}['"]?\\s*$`, 'm'), `Missing workspace glob: ${glob}`)

const turbo = JSON.parse(await read('turbo.json'))
for (const task of ['build', 'lint', 'typecheck', 'test']) {
  assert.ok(turbo.tasks?.[task], `Missing Turbo task: ${task}`)
  assert.ok(turbo.tasks[task].dependsOn?.includes('^build'), `${task} must depend on dependency builds`)
  assert.notEqual(turbo.tasks[task].cache, false, `${task} must be cache-enabled`)
  assert.ok(turbo.tasks[task].inputs?.includes('$TURBO_DEFAULT$'), `${task} must include Turbo default inputs`)
  assert.ok(turbo.tasks[task].inputs.some(input => input.startsWith('$TURBO_ROOT$/')), `${task} must include a root configuration input`)
}
assert.equal(turbo.tasks?.dev?.persistent, true)
assert.equal(turbo.tasks?.dev?.cache, false)
assert.ok(turbo.tasks?.['test:e2e']?.dependsOn?.includes('@memorilo/desktop#build'))

const desktopPackage = JSON.parse(await read('apps/desktop/package.json'))
assert.equal(desktopPackage.name, '@memorilo/desktop')
for (const [script, command] of Object.entries({ dev: 'electron-vite dev', build: 'electron-vite build' }))
  assert.equal(desktopPackage.scripts?.[script], command)
assert.equal(desktopPackage.main, 'out/main/index.js')
assert.equal(desktopPackage.scripts?.['rebuild:native'], 'electron-builder install-app-deps')
assert.match(desktopPackage.scripts?.['pack:dir'], /electron-builder --dir/)
assert.equal(desktopPackage.devDependencies?.electron, '43.2.0')
assert.equal(desktopPackage.devDependencies?.['electron-vite'], '5.0.0')
assert.equal(desktopPackage.devDependencies?.['electron-builder'], '26.15.3')
assert.match(desktopPackage.devDependencies?.vite, /^\^7\./)

const electronVite = await read('apps/desktop/electron.vite.config.ts')
assert.doesNotMatch(electronVite, /externalizeDepsPlugin/)
assert.match(electronVite, /main:\s*\{\s*root:\s*resolve\(desktopRoot, 'main'\)/)
assert.match(electronVite, /outDir:\s*resolve\(desktopRoot, 'out\/main'\)/)
assert.match(electronVite, /input:\s*resolve\(desktopRoot, 'main\/src\/index\.ts'\)/)
assert.doesNotMatch(electronVite, /input:\s*\{\s*main:/)
assert.match(electronVite, /externalizeDeps:\s*\{\s*include:\s*\['better-sqlite3'\]/)
assert.match(electronVite, /preload:\s*\{\s*root:\s*resolve\(desktopRoot, 'preload'\)/)
assert.match(electronVite, /input:\s*resolve\(desktopRoot, 'preload\/src\/index\.ts'\)/)
assert.match(electronVite, /externalizeDeps:\s*false/)
assert.match(electronVite, /renderer:\s*\{\s*root:\s*resolve\(desktopRoot, 'renderer'\)/)
assert.match(electronVite, /outDir:\s*resolve\(desktopRoot, 'out\/renderer'\)/)
assert.ok(electronVite.indexOf('TanStackRouterVite(') < electronVite.indexOf('react('), 'TanStack Router plugin must run before React')

const eslintConfig = await read('eslint.config.ts')
assert.match(eslintConfig, /react:\s*true/)
assert.match(eslintConfig, /typescript:\s*true/)
assert.match(eslintConfig, /formatters:\s*false/)

const readme = await read('README.md')
for (const command of ['pnpm install', 'pnpm dev', 'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build', 'pnpm test:e2e'])
  assert.ok(readme.includes(command), `README must document ${command}`)
assert.ok(readme.includes('pnpm --filter @memorilo/desktop rebuild:native'))
assert.match(readme, /Turbo filters/i)
assert.match(readme, /Drizzle/i)

const license = await read('LICENSE')
assert.ok(license.length > 30_000, 'LICENSE must contain the complete AGPL v3 text')
for (const marker of [
  'GNU AFFERO GENERAL PUBLIC LICENSE',
  'Version 3, 19 November 2007',
  'Copyright (C) 2007 Free Software Foundation, Inc.',
  '13. Remote Network Interaction; Use with the GNU General Public License.',
  'END OF TERMS AND CONDITIONS',
])
  assert.ok(license.includes(marker), `LICENSE missing canonical marker: ${marker}`)

for (const path of ['tsconfig.base.json', 'vitest.workspace.ts', '.gitignore'])
  await read(path)

console.log('Workspace baseline verified.')
