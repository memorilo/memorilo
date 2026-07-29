import type { DesktopApi } from '@memorilo/desktop-preload'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'

import modelConfiguration from '../../../config/embedding-model.json' with { type: 'json' }

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDist = resolve(repositoryRoot, 'apps/desktop/dist')

function packagedApplication(): { executable: string, resources: string } {
  if (process.platform === 'darwin') {
    const directory = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
    const application = resolve(desktopDist, directory, 'memorilo.app', 'Contents')
    return {
      executable: resolve(application, 'MacOS/memorilo'),
      resources: resolve(application, 'Resources'),
    }
  }
  if (process.platform === 'win32') {
    const application = resolve(desktopDist, 'win-unpacked')
    return {
      executable: resolve(application, 'memorilo.exe'),
      resources: resolve(application, 'resources'),
    }
  }
  if (process.platform === 'linux') {
    const application = resolve(desktopDist, 'linux-unpacked')
    return {
      executable: resolve(application, 'memorilo'),
      resources: resolve(application, 'resources'),
    }
  }
  throw new Error(`Unsupported packaged test platform: ${process.platform}`)
}

test('packaged desktop executes offline embedding search', async () => {
  test.setTimeout(120_000)
  const application = packagedApplication()
  const modelFile = resolve(
    application.resources,
    'embedding-models',
    modelConfiguration.id,
    modelConfiguration.revision,
    'onnx/model_quantized.onnx',
  )
  await access(modelFile)

  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'memorilo-packaged-embedding-'))
  try {
    const electronApplication = await electron.launch({
      args: [`--user-data-dir=${userDataDirectory}`],
      env: {
        ...process.env,
        MEMORILO_DATABASE_PATH: ':memory:',
        MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      },
      executablePath: application.executable,
    })
    try {
      const window = await electronApplication.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      const result = await window.evaluate(async () => {
        const desktop = (window as typeof window & { desktop: DesktopApi }).desktop
        const document = await desktop.openMostRecentDocument()
        await desktop.saveDocument({
          id: document.id,
          nodes: [
            {
              attributes: {},
              id: 'database-node',
              kind: 'outline',
              ordinal: 0,
              parentId: null,
              text: '数据库索引可以显著提升查询速度',
            },
            {
              attributes: {},
              id: 'animal-node',
              kind: 'outline',
              ordinal: 1,
              parentId: null,
              text: '红熊猫生活在高山森林中',
            },
          ],
          snapshot: Uint8Array.from([7, 8, 9]),
          title: 'Packaged embedding document',
        })

        const deadline = Date.now() + 60_000
        while (Date.now() < deadline) {
          const hits = await desktop.searchNodes({
            documentId: document.id,
            limit: 2,
            mode: 'semantic',
            query: '如何提升数据库查询性能',
          })
          if (hits.length === 2)
            return hits.map(hit => hit.id)
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        throw new Error('Packaged embedding index did not become searchable within 60 seconds')
      })

      expect(result).toEqual(['database-node', 'animal-node'])
    }
    finally {
      await electronApplication.close()
    }
  }
  finally {
    await rm(userDataDirectory, { force: true, recursive: true })
  }
})
