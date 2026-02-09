import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { unpluginRouterGeneratorFactory } from '@tanstack/router-plugin'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const routesDirectory = 'src/routes'
const generatedRouteTree = 'src/routeTree.gen.ts'

const plugin = unpluginRouterGeneratorFactory({
  routesDirectory,
  generatedRouteTree,
})
const plugins = Array.isArray(plugin) ? plugin : [plugin]

async function generateOnce() {
  for (const p of plugins) {
    if (p.vite?.configResolved) {
      await p.vite.configResolved({ root })
    }
  }
}

const watchMode = process.argv.includes('--watch')

if (!watchMode) {
  await generateOnce()
  process.exit(0)
}

const routesDir = path.resolve(root, routesDirectory)
const configPath = path.resolve(root, 'tsr.config.json')

let running = false
let pending = false

async function scheduleGenerate() {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await generateOnce()
  }
  catch (error) {
    console.error('[routes] generation failed')
    console.error(error)
  }
  finally {
    running = false
    if (pending) {
      pending = false
      await scheduleGenerate()
    }
  }
}

await scheduleGenerate()

const watchers = new Map()

async function watchDir(dir) {
  if (watchers.has(dir))
    return

  try {
    const watcher = fs.watch(dir, async (eventType, filename) => {
      if (filename) {
        const fullPath = path.join(dir, filename)
        if (eventType === 'rename') {
          try {
            const stat = await fs.promises.stat(fullPath)
            if (stat.isDirectory()) {
              await watchDir(fullPath)
            }
          }
          catch {
            // ignore missing files
          }
        }
      }

      void scheduleGenerate()
    })

    watchers.set(dir, watcher)

    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await watchDir(path.join(dir, entry.name))
      }
    }
  }
  catch (error) {
    console.warn(`[routes] unable to watch: ${dir}`)
    console.warn(error)
  }
}

await watchDir(routesDir)

if (fs.existsSync(configPath)) {
  const configWatcher = fs.watch(configPath, () => {
    void scheduleGenerate()
  })
  watchers.set(configPath, configWatcher)
}

process.on('SIGINT', () => {
  for (const watcher of watchers.values()) {
    watcher.close()
  }
  process.exit(0)
})

console.log('[routes] watching for changes...')
