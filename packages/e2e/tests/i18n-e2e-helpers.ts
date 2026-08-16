import type { ElectronApplication } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from '@playwright/test'

export interface DesktopLanguageConfiguration {
  language: 'system' | 'en' | 'zh-CN'
}

export const I18N_DEV_RENDERER_URL = 'http://127.0.0.1:5199'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const desktopRequire = createRequire(resolve(desktopDirectory, 'package.json'))
const viteExecutablePath = resolve(dirname(desktopRequire.resolve('vite')), '../../bin/vite.js')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

function runnableConfiguration(configuration: DesktopLanguageConfiguration): Record<string, unknown> {
  return {
    anki: {
      apiKey: '',
      enabled: false,
      host: '127.0.0.1',
      port: 8765,
    },
    backup: {
      enabled: false,
      intervalMinutes: 1_440,
      retentionCount: 7,
    },
    defaultNoteLearningEnabled: true,
    flashcards: {
      buryInterdayLearningSiblings: true,
      buryNewSiblings: true,
      buryReviewSiblings: true,
      interdayOrder: 'before-reviews',
      learnAheadMinutes: 20,
      newCardsPerDay: 20,
      newGatherOrder: 'source',
      reviewOrder: 'due-random',
      studyDayStartsAtHour: 4,
    },
    goals: {
      dailyLearningGoalCards: 30,
      dailyLearningGoalMode: 'spread-week',
    },
    learning: {
      enabled: true,
    },
    language: configuration.language,
    mcp: {
      accessToken: '',
      enabled: false,
      port: 8765,
    },
    networkImagePasteBehavior: 'download',
    outdentBehavior: 'logical',
    readerAnnotationCopyFormat: 'text',
    readerArrowKeyPageTurning: true,
    readerEpubPresentationMode: 'publisher',
    readerPageMode: 'continuous',
    reduceMotion: false,
    tiffConversionFormat: 'webp',
    weekStart: 'sunday',
  }
}

async function writeConfiguration(userDataDirectory: string, configuration: DesktopLanguageConfiguration): Promise<void> {
  await mkdir(userDataDirectory, { recursive: true })
  const serialized = `${JSON.stringify(runnableConfiguration(configuration), null, 2)}\n`
  await writeFile(resolve(userDataDirectory, 'configuration.json'), serialized, { encoding: 'utf8' })
}

export interface I18nTestContext {
  directory: string
  userDataDirectory: string
  electronApplication: ElectronApplication
}

export async function launchI18nApplication(
  configuration: DesktopLanguageConfiguration,
  options: { rendererUrl?: string } = {},
): Promise<I18nTestContext> {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-i18n-'))
  const userDataDirectory = resolve(directory, 'user-data')
  await writeConfiguration(userDataDirectory, configuration)

  const env: Record<string, string> = {
    ...process.env,
    MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
  }
  if (options.rendererUrl)
    env.ELECTRON_RENDERER_URL = options.rendererUrl

  const electronApplication = await electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env,
    executablePath: electronExecutablePath,
  })

  return { directory, userDataDirectory, electronApplication }
}

export async function updateConfiguration(
  userDataDirectory: string,
  configuration: DesktopLanguageConfiguration,
): Promise<void> {
  await writeConfiguration(userDataDirectory, configuration)
}

export async function removeI18nTestContext(context: I18nTestContext): Promise<void> {
  await context.electronApplication.close()
  await rm(context.directory, { force: true, recursive: true })
}

export interface DevServerProcess {
  child: ChildProcess
  url: string
}

export async function startRendererDevServer(): Promise<DevServerProcess> {
  const child = spawn(process.execPath, [viteExecutablePath, '--config', 'renderer-vite.config.ts'], {
    cwd: desktopDirectory,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForDevServer(child, I18N_DEV_RENDERER_URL)
  }
  catch (error) {
    child.kill()
    throw error
  }

  return { child, url: I18N_DEV_RENDERER_URL }
}

async function waitForDevServer(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + 30_000
  let stderr = ''
  child.stderr?.on('data', chunk => (stderr += String(chunk)))

  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Renderer dev server exited before becoming ready:\n${stderr}`)
    try {
      const response = await fetch(url)
      if (response.ok)
        return
    }
    catch {
      // server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Renderer dev server did not become ready at ${url}\n${stderr}`)
}

export const LOCALE_APP_ZH_PATH = resolve(repositoryRoot, 'locales/app/zh.json')
export const LOCALE_APP_EN_PATH = resolve(repositoryRoot, 'locales/app/en.json')
