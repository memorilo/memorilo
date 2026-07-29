import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

test('first sidebar collapse moves the editor continuously', async () => {
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'memorilo-sidebar-motion-'))
  try {
    const electronApplication = await electron.launch({
      args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MEMORILO_DATABASE_PATH: ':memory:',
        MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      },
      executablePath: electronExecutablePath,
    })
    try {
      const window = await electronApplication.firstWindow()
      await window.emulateMedia({ reducedMotion: 'no-preference' })
      await window.getByRole('button', { name: 'Hide Sidebar' }).waitFor()

      const editorPositions = await window.evaluate(async () => {
        const button = document.querySelector('button[aria-label="Hide Sidebar"]')
        const editor = document.querySelector('main > section[aria-label]')
        if (!(button instanceof HTMLButtonElement))
          throw new TypeError('Hide Sidebar button is unavailable')
        if (!(editor instanceof HTMLElement))
          throw new TypeError('Editor region is unavailable')

        const positions = [editor.getBoundingClientRect().left]
        button.click()

        await new Promise<void>((resolveAnimation, rejectAnimation) => {
          const deadline = performance.now() + 1_200
          const sample = () => {
            positions.push(editor.getBoundingClientRect().left)
            if (!document.querySelector('aside[aria-label="Workspace navigation"]')) {
              resolveAnimation()
              return
            }
            if (performance.now() >= deadline) {
              rejectAnimation(new Error('Sidebar did not finish collapsing within 1200ms'))
              return
            }
            requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })

        return positions
      })

      const start = editorPositions[0]
      const end = editorPositions.at(-1)
      if (start === undefined || end === undefined)
        throw new TypeError('Editor position sampling returned no measurements')

      expect(end).toBeLessThan(start - 200)
      const travel = start - end
      const progressSamples = editorPositions
        .map(position => (start - position) / travel)
        .filter(progress => progress >= 0 && progress <= 1)
        .sort((left, right) => left - right)
      const largestProgressGap = progressSamples.slice(1).reduce((largestGap, progress, index) => {
        const previousProgress = progressSamples[index]
        if (previousProgress === undefined)
          throw new TypeError('Editor progress sampling lost its preceding measurement')
        return Math.max(largestGap, progress - previousProgress)
      }, 0)
      expect(largestProgressGap).toBeLessThan(0.75)
    }
    finally {
      await electronApplication.close()
    }
  }
  finally {
    await rm(userDataDirectory, { force: true, recursive: true })
  }
})
