import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(pnpm, ['exec', 'electron-builder', '--dir'], {
  cwd: desktopDirectory,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  stdio: 'inherit',
})

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (signal !== null)
      reject(new Error(`electron-builder terminated with signal ${signal}`))
    else
      resolveExit(code)
  })
})

if (exitCode !== 0)
  throw new Error(`electron-builder exited with code ${exitCode}`)
