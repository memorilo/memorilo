import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'

type Language = 'en' | 'zh-CN'
type RepeatRule = Record<string, unknown>

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function configuration(language: Language): Record<string, unknown> {
  return {
    anki: { apiKey: '', enabled: false, host: '127.0.0.1', port: 8765 },
    backup: { enabled: false, intervalMinutes: 1_440, retentionCount: 7 },
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
    goals: { dailyLearningGoalCards: 30, dailyLearningGoalMode: 'spread-week' },
    language,
    learning: { enabled: true },
    mcp: { accessToken: '', enabled: false, port: 8765 },
    networkImagePasteBehavior: 'download',
    outdentBehavior: 'logical',
    readerAnnotationCopyFormat: 'text',
    readerArrowKeyPageTurning: true,
    readerEpubPresentationMode: 'publisher',
    readerPageMode: 'continuous',
    reduceMotion: true,
    tiffConversionFormat: 'webp',
    todo: {
      enabled: true,
      recurringTaskCompletionAction: 'archive-completed-to-today',
    },
    weekStart: 'sunday',
  }
}

async function launchApplication(language: Language): Promise<{
  application: ElectronApplication
  directory: string
}> {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-todo-recurrence-'))
  const userDataDirectory = resolve(directory, 'user-data')
  await mkdir(userDataDirectory, { recursive: true })
  await writeFile(
    resolve(userDataDirectory, 'configuration.json'),
    `${JSON.stringify(configuration(language), null, 2)}\n`,
    'utf8',
  )
  const application = await electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: ':memory:',
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: '1',
      MEMORILO_SHELF_IMAGE_CACHE_PATH: ':memory:',
    },
    executablePath: electronExecutablePath,
  })
  return { application, directory }
}

async function closeApplication(context: Awaited<ReturnType<typeof launchApplication>>): Promise<void> {
  await context.application.close()
  await rm(context.directory, { force: true, recursive: true })
}

function localDate(offsetDays = 0): Date {
  const value = new Date()
  value.setHours(12, 0, 0, 0)
  value.setDate(value.getDate() + offsetDays)
  return value
}

function dateKey(value: Date): string {
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'))
    .join('-')
}

function icsDate(value: Date): string {
  return dateKey(value).replaceAll('-', '')
}

function holidayCalendar(): string {
  const events = [1, 3, 6, 10].map((offset, index) => {
    const date = localDate(offset)
    return [
      'BEGIN:VEVENT',
      `UID:e2e-holiday-${index}`,
      `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(localDate(offset + 1))}`,
      `SUMMARY:E2E Holiday ${index + 1}`,
      'END:VEVENT',
    ].join('\r\n')
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n')
}

async function mockChinaHolidayCalendar(application: ElectronApplication): Promise<void> {
  await application.evaluate(async (_electron, calendar) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url
      if (url.includes('/holiday/CN_zh.ics')) {
        return new Response(calendar, {
          headers: { 'content-type': 'text/calendar', 'etag': '"todo-recurrence-e2e"' },
          status: 200,
        })
      }
      return originalFetch(input, init)
    }
  }, holidayCalendar())
}

async function createNoteWithTasks(page: Page, noteTitle: string, taskTitles: readonly string[], language: Language): Promise<void> {
  const journals = language === 'en' ? 'Journals' : '日志'
  const commandSearch = language === 'en' ? 'Search commands and Notes' : '搜索命令和笔记'
  const taskList = language === 'en' ? /^Task list/ : /^任务列表/
  await page.getByRole('link', { name: journals }).waitFor()
  await page.keyboard.press('Meta+P')
  await page.getByRole('combobox', { name: commandSearch }).fill(noteTitle)
  await page.getByRole('option').filter({ hasText: noteTitle }).last().click()

  const editor = page.getByRole('textbox', { name: language === 'en' ? 'Editor content' : '编辑器内容' })
  const heading = editor.locator('h1').first()
  await expect(heading).toHaveText(noteTitle)
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('/todo')
  await page.getByRole('option', { name: taskList }).click()
  await page.keyboard.insertText(taskTitles[0] ?? '')

  for (const title of taskTitles.slice(1)) {
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.insertText(title)
  }
  for (const title of taskTitles)
    await expect(taskBlock(page, title)).toHaveCount(1)
}

function taskBlock(page: Page, title: string): Locator {
  return page.locator('[data-list-kind="task"]').filter({ hasText: title })
}

async function openSchedule(page: Page, title: string, language: Language): Promise<{ block: Locator, panel: Locator }> {
  const block = taskBlock(page, title)
  await block.hover()
  await block.getByRole('button', { name: language === 'en' ? 'Task actions' : '任务操作' }).click()
  const panel = page.getByRole('dialog', { name: language === 'en' ? 'Schedule' : '时间安排' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { exact: true, name: language === 'en' ? 'Today' : '今天' }).click()
  return { block, panel }
}

async function openRepeat(panel: Locator, page: Page, language: Language): Promise<Locator> {
  await panel.getByRole('button', { name: language === 'en' ? /^Repeat/ : /^重复/ }).click()
  const repeat = page.getByRole('dialog', { name: language === 'en' ? 'Repeat settings' : '重复设置' })
  await expect(repeat).toBeVisible()
  return repeat
}

async function saveSchedule(panel: Locator, language: Language): Promise<void> {
  await panel.getByRole('button', { exact: true, name: language === 'en' ? 'Done' : '确定' }).click()
  await expect(panel).toBeHidden()
}

async function readRule(block: Locator): Promise<RepeatRule | null> {
  const value = await block.getAttribute('data-task-repeat')
  return value === null ? null : JSON.parse(value) as RepeatRule
}

async function expectRule(block: Locator, expected: RepeatRule): Promise<void> {
  await expect.poll(() => readRule(block)).toMatchObject(expected)
}

async function configurePreset(
  page: Page,
  title: string,
  preset: RegExp,
  expected: RepeatRule,
  language: Language = 'en',
): Promise<void> {
  const { block, panel } = await openSchedule(page, title, language)
  const repeat = await openRepeat(panel, page, language)
  await repeat.getByRole('button', { name: preset }).click()
  await saveSchedule(panel, language)
  await expectRule(block, expected)
}

async function openCustomRepeat(page: Page, title: string, language: Language): Promise<{
  block: Locator
  panel: Locator
  repeat: Locator
}> {
  const { block, panel } = await openSchedule(page, title, language)
  const presets = await openRepeat(panel, page, language)
  await presets.getByRole('button', { name: language === 'en' ? /^Custom/ : /^自定义/ }).click()
  const referenceLabel = language === 'en' ? 'Repeat reference' : '重复参考日期'
  await expect(page.getByLabel(referenceLabel)).toBeVisible()
  const repeat = page
    .getByRole('dialog', { name: language === 'en' ? 'Repeat settings' : '重复设置' })
    .filter({ has: page.getByLabel(referenceLabel) })
  return { block, panel, repeat }
}

async function saveCustomRepeat(panel: Locator, repeat: Locator, language: Language): Promise<void> {
  await repeat.getByRole('button', { exact: true, name: language === 'en' ? 'Done' : '确定' }).click()
  await saveSchedule(panel, language)
}

async function setWeekdays(repeat: Locator, wanted: readonly string[]): Promise<void> {
  const group = repeat.getByRole('group', { name: 'Repeat on' })
  for (const label of wanted) {
    const button = group.getByRole('button', { exact: true, name: label })
    if (await button.getAttribute('aria-pressed') !== 'true')
      await button.click()
  }
  for (const label of weekdayLabels.filter(label => !wanted.includes(label))) {
    const button = group.getByRole('button', { exact: true, name: label })
    if (await button.getAttribute('aria-pressed') === 'true')
      await button.click()
  }
}

async function setCheckbox(repeat: Locator, label: string, checked: boolean): Promise<void> {
  const checkbox = repeat.getByLabel(label)
  if (await checkbox.isChecked() !== checked)
    await checkbox.click()
}

test.describe('Todo recurrence user flows', () => {
  test.setTimeout(240_000)

  test('covers presets and every regular custom rule combination', async () => {
    const context = await launchApplication('en')
    try {
      const page = await context.application.firstWindow()
      const today = localDate()
      const titles = [
        'E2E repeat daily preset',
        'E2E repeat weekly preset',
        'E2E repeat monthly preset',
        'E2E repeat yearly preset',
        'E2E repeat workdays preset',
        'E2E repeat completion week',
        'E2E repeat selected month date',
        'E2E repeat monthly weekday',
        'E2E repeat monthly workday',
        'E2E repeat yearly date',
        'E2E repeat yearly weekday',
        'E2E repeat disable',
      ]
      await createNoteWithTasks(page, 'Todo recurrence E2E', titles, 'en')

      await configurePreset(page, titles[0]!, /^Daily/, {
        interval: 1,
        mode: 'due',
        skipHolidays: false,
        skipWeekends: false,
        unit: 'day',
      })
      await configurePreset(page, titles[1]!, /^Weekly/, {
        interval: 1,
        mode: 'due',
        unit: 'week',
        weekdays: [today.getDay()],
      })
      await configurePreset(page, titles[2]!, /^Monthly/, {
        interval: 1,
        mode: 'due',
        monthDay: today.getDate(),
        monthMode: 'date',
        unit: 'month',
      })
      await configurePreset(page, titles[3]!, /^Yearly/, {
        interval: 1,
        mode: 'due',
        unit: 'year',
        yearDay: today.getDate(),
        yearMode: 'date',
        yearMonth: today.getMonth() + 1,
      })
      await configurePreset(page, titles[4]!, /^Workdays/, {
        interval: 1,
        mode: 'due',
        skipHolidays: false,
        skipWeekends: true,
        unit: 'day',
      })

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[5]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('completion')
        await repeat.getByLabel('Every').fill('2')
        await repeat.getByLabel('Unit').selectOption('week')
        await setWeekdays(repeat, ['Mon', 'Wed', 'Fri'])
        await repeat.getByLabel('End repeat').selectOption('date')
        const endDate = dateKey(localDate(120))
        await repeat.locator('input[type="date"]').last().fill(endDate)
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          endDate,
          interval: 2,
          mode: 'completion',
          unit: 'week',
          weekdays: [1, 3, 5],
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[6]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('custom')
        await repeat.getByRole('button', { name: 'Next month' }).click()
        await repeat.getByRole('button', { exact: true, name: '15' }).click()
        await repeat.getByLabel('Every').fill('2')
        await repeat.getByLabel('Unit').selectOption('month')
        await repeat.getByRole('tab', { name: 'By date' }).click()
        await repeat.getByRole('group', { name: 'Last day' }).getByRole('button', { exact: true, name: '31' }).click()
        const anchor = new Date(today.getFullYear(), today.getMonth() + 1, 15, 12)
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          anchorDate: dateKey(anchor),
          interval: 2,
          mode: 'custom',
          monthDay: 31,
          monthMode: 'date',
          unit: 'month',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[7]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('due')
        await repeat.getByLabel('Unit').selectOption('month')
        await repeat.getByRole('tab', { name: 'By weekday' }).click()
        await repeat.getByLabel('Occurrence').selectOption('-1')
        await repeat.getByLabel('Weekday').selectOption('5')
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          interval: 1,
          mode: 'due',
          monthMode: 'weekday',
          monthOrdinal: -1,
          monthWeekday: 5,
          unit: 'month',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[8]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('completion')
        await repeat.getByLabel('Every').fill('3')
        await repeat.getByLabel('Unit').selectOption('month')
        await repeat.getByRole('tab', { name: 'By workday' }).click()
        await repeat.locator('label').filter({ hasText: /^Workday/ }).getByRole('combobox').selectOption('3')
        await setCheckbox(repeat, 'Skip weekends', true)
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          interval: 3,
          mode: 'completion',
          monthMode: 'workday',
          monthOrdinal: 3,
          skipWeekends: true,
          unit: 'month',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[9]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('due')
        await repeat.getByLabel('Every').fill('2')
        await repeat.getByLabel('Unit').selectOption('year')
        await repeat.getByRole('tab', { name: 'By date' }).click()
        await repeat.locator('label').filter({ hasText: /^Month/ }).getByRole('combobox').selectOption('2')
        await repeat.getByRole('group', { name: 'Last day' }).getByRole('button', { name: 'Last day' }).click()
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          interval: 2,
          mode: 'due',
          unit: 'year',
          yearDay: 'last',
          yearMode: 'date',
          yearMonth: 2,
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[10]!, 'en')
        await repeat.getByLabel('Repeat reference').selectOption('completion')
        await repeat.getByLabel('Unit').selectOption('year')
        await repeat.getByRole('tab', { name: 'By weekday' }).click()
        await repeat.locator('label').filter({ hasText: /^Month/ }).getByRole('combobox').selectOption('11')
        await repeat.getByLabel('Occurrence').selectOption('4')
        await repeat.getByLabel('Weekday').selectOption('4')
        await saveCustomRepeat(panel, repeat, 'en')
        await expectRule(block, {
          interval: 1,
          mode: 'completion',
          unit: 'year',
          yearMode: 'weekday',
          yearMonth: 11,
          yearOrdinal: 4,
          yearWeekday: 4,
        })
      }

      await configurePreset(page, titles[11]!, /^Daily/, { mode: 'due', unit: 'day' })
      {
        const { block, panel } = await openSchedule(page, titles[11]!, 'en')
        const repeat = await openRepeat(panel, page, 'en')
        await repeat.getByRole('button', { exact: true, name: 'None' }).click()
        await saveSchedule(panel, 'en')
        await expect.poll(() => readRule(block)).toBeNull()
      }
    }
    finally {
      await closeApplication(context)
    }
  })

  test('covers statutory-holiday policies, combined filters, and Chinese lunar recurrence', async () => {
    const context = await launchApplication('zh-CN')
    try {
      await mockChinaHolidayCalendar(context.application)
      const page = await context.application.firstWindow()
      const titles = [
        'E2E 节假日过滤组合',
        'E2E 法定节假日重复',
        'E2E 节假日顺延',
        'E2E 跳过整次节假日',
        'E2E 农历重复',
      ]
      await createNoteWithTasks(page, 'Todo 重复 E2E', titles, 'zh-CN')

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[0]!, 'zh-CN')
        await repeat.getByLabel('重复参考日期').selectOption('due')
        await repeat.getByLabel('每隔').fill('1')
        await repeat.getByLabel('单位').selectOption('day')
        await setCheckbox(repeat, '跳过法定节假日', true)
        await setCheckbox(repeat, '跳过双休日', true)
        await saveCustomRepeat(panel, repeat, 'zh-CN')
        await expectRule(block, {
          calendarId: 'cn-holidays',
          interval: 1,
          mode: 'due',
          skipHolidays: true,
          skipWeekends: true,
          unit: 'day',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[1]!, 'zh-CN')
        await repeat.getByLabel('重复参考日期').selectOption('due')
        await repeat.getByLabel('每隔').fill('2')
        await repeat.getByLabel('单位').selectOption('holiday')
        await repeat.getByLabel('节假日策略').selectOption('allow')
        await saveCustomRepeat(panel, repeat, 'zh-CN')
        await expectRule(block, {
          calendarId: 'cn-holidays',
          holidayPolicy: 'allow',
          interval: 2,
          mode: 'due',
          unit: 'holiday',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[2]!, 'zh-CN')
        await repeat.getByLabel('重复参考日期').selectOption('completion')
        await repeat.getByLabel('单位').selectOption('holiday')
        await repeat.getByLabel('节假日策略').selectOption('next-workday')
        await saveCustomRepeat(panel, repeat, 'zh-CN')
        await expectRule(block, {
          calendarId: 'cn-holidays',
          holidayPolicy: 'next-workday',
          interval: 1,
          mode: 'completion',
          unit: 'holiday',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[3]!, 'zh-CN')
        await repeat.getByLabel('重复参考日期').selectOption('due')
        await repeat.getByLabel('单位').selectOption('week')
        await repeat.getByLabel('节假日策略').selectOption('skip')
        await saveCustomRepeat(panel, repeat, 'zh-CN')
        await expectRule(block, {
          calendarId: 'cn-holidays',
          holidayPolicy: 'skip',
          interval: 1,
          mode: 'due',
          unit: 'week',
        })
      }

      {
        const { block, panel, repeat } = await openCustomRepeat(page, titles[4]!, 'zh-CN')
        await repeat.getByLabel('重复参考日期').selectOption('custom')
        await repeat.getByRole('button', { name: '下个月' }).click()
        await repeat.getByRole('button', { exact: true, name: '15' }).click()
        await repeat.getByLabel('每隔').fill('2')
        await repeat.getByLabel('单位').selectOption('lunar')
        await repeat.getByLabel('农历月').selectOption('8')
        await repeat.getByLabel('农历日').selectOption('15')
        const today = localDate()
        const anchor = new Date(today.getFullYear(), today.getMonth() + 1, 15, 12)
        await saveCustomRepeat(panel, repeat, 'zh-CN')
        await expectRule(block, {
          anchorDate: dateKey(anchor),
          interval: 2,
          lunarDay: 15,
          lunarMonth: 8,
          mode: 'custom',
          unit: 'lunar',
        })
      }
    }
    finally {
      await closeApplication(context)
    }
  })
})
