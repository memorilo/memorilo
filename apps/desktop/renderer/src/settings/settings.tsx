import type { ConfigurationField, ConfigurationSection, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { TFunction } from 'i18next'
import type { CSSProperties } from 'react'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { getUiThemeDefinitions, SegmentedControl, Sidebar } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, CalendarDays, GraduationCap, HardDrive, NotebookPen, Plug, Settings2, Wifi } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../shared/configuration'
import { AssetSettings } from './asset-settings'
import { CalendarSettings } from './calendar-settings'
import { DatabaseSettings } from './database-settings'
import { P2pSettings } from './p2p-settings'
import { settingsShellStyles as settingsStyles } from './settings-shell.stylex'

type SettingsCategoryId = 'calendar' | 'editor' | 'general' | 'learning' | 'mcp' | 'media' | 'reading' | 'sync'
type SourceSectionId = 'backup' | 'editor' | 'flashcards' | 'general' | 'goals' | 'images' | 'learning' | 'mcp' | 'reading' | 'todo'

interface SettingsCategoryDefinition {
  readonly id: SettingsCategoryId
  readonly sectionIds: readonly SourceSectionId[]
  readonly showSectionHeadings?: boolean
}

const settingsCategoryDefinitions: readonly SettingsCategoryDefinition[] = [
  { id: 'general', sectionIds: ['general'] },
  { id: 'calendar', sectionIds: ['todo'], showSectionHeadings: true },
  { id: 'editor', sectionIds: ['editor'] },
  { id: 'reading', sectionIds: ['reading'] },
  { id: 'learning', sectionIds: ['learning', 'goals', 'flashcards'], showSectionHeadings: true },
  { id: 'media', sectionIds: ['images', 'backup'], showSectionHeadings: true },
  { id: 'mcp', sectionIds: ['mcp'] },
  { id: 'sync', sectionIds: [] },
]

const learningDetailSectionIds: readonly SourceSectionId[] = ['flashcards', 'goals']

const categoryIcons = {
  calendar: CalendarDays,
  editor: NotebookPen,
  general: Settings2,
  learning: GraduationCap,
  mcp: Plug,
  media: HardDrive,
  reading: BookOpen,
  sync: Wifi,
} as const

function translateCategoryLabel(categoryId: SettingsCategoryId, t: TFunction): string {
  switch (categoryId) {
    case 'calendar':
      return t('calendarSection')
    case 'general':
      return t('generalSection')
    case 'editor':
      return t('editorSection')
    case 'reading':
      return t('readingSection')
    case 'learning':
      return t('learningSection')
    case 'media':
      return t('mediaSection')
    case 'mcp':
      return t('mcpSection')
    case 'sync':
      return t('syncSection')
  }
}

function translateCategoryDescription(categoryId: SettingsCategoryId, t: TFunction): string {
  switch (categoryId) {
    case 'calendar':
      return t('calendarDescription')
    case 'general':
      return t('generalDescription')
    case 'editor':
      return t('editorDescription')
    case 'reading':
      return t('readingDescription')
    case 'learning':
      return t('learningDescription')
    case 'media':
      return t('mediaDescription')
    case 'mcp':
      return t('mcpDescription')
    case 'sync':
      return t('syncDescription')
  }
}

function translateSectionLabel(sectionId: string, t: TFunction): string {
  switch (sectionId) {
    case 'backup':
      return t('backupSection')
    case 'general':
      return t('generalSection')
    case 'editor':
      return t('editorSection')
    case 'flashcards':
      return t('flashcardsSection')
    case 'goals':
      return t('goalsSection')
    case 'learning':
      return t('learningSection')
    case 'images':
      return t('imagesSection')
    case 'reading':
      return t('readingSection')
    case 'mcp':
      return t('mcpSection')
    case 'todo':
      return t('todoSection')
    default:
      return sectionId
  }
}

function translateFieldLabel(field: ConfigurationField, t: TFunction): string {
  switch (field.path) {
    case 'backup.enabled':
      return t('backupEnabled')
    case 'backup.intervalMinutes':
      return t('backupInterval')
    case 'backup.retentionCount':
      return t('backupRetention')
    case 'language':
      return t('language')
    case 'reduceMotion':
      return t('reduceMotion')
    case 'panel.tabOrder':
      return t('panelTabOrder')
    case 'defaultNoteLearningEnabled':
      return t('defaultNoteLearningEnabled')
    case 'weekStart':
      return t('weekStart')
    case 'outdentBehavior':
      return t('outdentBehavior')
    case 'networkImagePasteBehavior':
      return t('networkImagePasteBehavior')
    case 'shortcuts.back': return t('shortcutBack')
    case 'shortcuts.bold': return t('shortcutBold')
    case 'shortcuts.code': return t('shortcutCode')
    case 'shortcuts.forward': return t('shortcutForward')
    case 'shortcuts.previousNoteStructureEntry': return t('shortcutPreviousNoteStructureEntry')
    case 'shortcuts.nextNoteStructureEntry': return t('shortcutNextNoteStructureEntry')
    case 'shortcuts.addBasicCard': return t('shortcutAddBasicCard')
    case 'shortcuts.highlight': return t('shortcutHighlight')
    case 'shortcuts.addCloze': return t('shortcutAddCloze')
    case 'shortcuts.italic': return t('shortcutItalic')
    case 'shortcuts.strike': return t('shortcutStrike')
    case 'shortcuts.underline': return t('shortcutUnderline')
    case 'readerArrowKeyPageTurning':
      return t('readerArrowKeyPageTurning')
    case 'readerAnnotationCopyFormat':
      return t('readerAnnotationCopyFormat')
    case 'readerEpubPresentationMode':
      return t('readerEpubPresentationMode')
    case 'readerPageMode':
      return t('readerPageMode')
    case 'tiffConversionFormat':
      return t('tiffConversionFormat')
    case 'mcp.enabled':
      return t('mcpEnabled')
    case 'learning.enabled':
      return t('learningEnabled')
    case 'todo.enabled':
      return t('todoEnabled')
    case 'todo.autoCompleteParentTasks':
      return t('autoCompleteParentTasks')
    case 'todo.blankTaskDurationMinutes':
      return t('blankTaskDurationMinutes')
    case 'todo.timelineWorkdayStartMinutes':
      return t('timelineWorkdayStartMinutes')
    case 'todo.timelineWorkdayEndMinutes':
      return t('timelineWorkdayEndMinutes')
    case 'todo.keepDetailOpenWhenTaskLeavesView':
      return t('keepTodoDetailOpen')
    case 'todo.recurringTaskCompletionAction':
      return t('recurringTaskCompletionAction')
    case 'mcp.port':
      return t('mcpPort')
    case 'mcp.accessToken':
      return t('mcpAccessToken')
    case 'flashcards.newCardsPerDay':
      return t('newCardsPerDay')
    case 'flashcards.newGatherOrder':
      return t('newGatherOrder')
    case 'flashcards.interdayOrder':
      return t('interdayOrder')
    case 'flashcards.reviewOrder':
      return t('reviewOrder')
    case 'flashcards.learnAheadMinutes':
      return t('learnAhead')
    case 'flashcards.studyDayStartsAtHour':
      return t('studyDayStarts')
    case 'flashcards.buryNewSiblings':
      return t('buryNewSiblings')
    case 'flashcards.buryReviewSiblings':
      return t('buryReviewSiblings')
    case 'flashcards.buryInterdayLearningSiblings':
      return t('buryInterdaySiblings')
    case 'goals.dailyLearningGoalMode':
      return t('dailyLearningGoal')
    case 'goals.dailyLearningGoalCards':
      return t('dailyLimit')
    default:
      return field.label
  }
}

function translateFieldDescription(field: ConfigurationField, t: TFunction): string | undefined {
  switch (field.path) {
    case 'backup.enabled':
      return t('backupEnabledDescription')
    case 'backup.intervalMinutes':
      return t('backupIntervalDescription')
    case 'backup.retentionCount':
      return t('backupRetentionDescription')
    case 'outdentBehavior':
      return t('outdentBehaviorDescription')
    case 'defaultNoteLearningEnabled':
      return t('defaultNoteLearningEnabledDescription')
    case 'weekStart':
      return t('weekStartDescription')
    case 'panel.tabOrder':
      return t('panelTabOrderDescription')
    case 'networkImagePasteBehavior':
      return t('networkImagePasteBehaviorDescription')
    case 'shortcuts.back':
    case 'shortcuts.bold':
    case 'shortcuts.code':
    case 'shortcuts.forward':
    case 'shortcuts.previousNoteStructureEntry':
    case 'shortcuts.nextNoteStructureEntry':
    case 'shortcuts.addBasicCard':
    case 'shortcuts.highlight':
    case 'shortcuts.addCloze':
    case 'shortcuts.italic':
    case 'shortcuts.strike':
    case 'shortcuts.underline':
      return t('shortcutDescription')
    case 'readerArrowKeyPageTurning':
      return t('readerArrowKeyPageTurningDescription')
    case 'readerAnnotationCopyFormat':
      return t('readerAnnotationCopyFormatDescription')
    case 'readerEpubPresentationMode':
      return t('readerEpubPresentationModeDescription')
    case 'readerPageMode':
      return t('readerPageModeDescription')
    case 'tiffConversionFormat':
      return t('tiffConversionFormatDescription')
    case 'mcp.enabled':
      return t('mcpEnabledDescription')
    case 'learning.enabled':
      return t('learningEnabledDescription')
    case 'todo.enabled':
      return t('todoEnabledDescription')
    case 'todo.autoCompleteParentTasks':
      return t('autoCompleteParentTasksDescription')
    case 'todo.blankTaskDurationMinutes':
      return t('blankTaskDurationMinutesDescription')
    case 'todo.timelineWorkdayStartMinutes':
      return t('timelineWorkdayStartMinutesDescription')
    case 'todo.timelineWorkdayEndMinutes':
      return t('timelineWorkdayEndMinutesDescription')
    case 'todo.keepDetailOpenWhenTaskLeavesView':
      return t('keepTodoDetailOpenDescription')
    case 'todo.recurringTaskCompletionAction':
      return t('recurringTaskCompletionActionDescription')
    case 'mcp.port':
      return t('mcpPortDescription')
    case 'mcp.accessToken':
      return t('mcpAccessTokenDescription')
    case 'flashcards.newCardsPerDay':
      return t('newCardsPerDayDescription')
    case 'goals.dailyLearningGoalCards':
      return t('dailyLimitDescription')
    default:
      return field.description
  }
}

function translateOptionLabel(value: string, t: TFunction): string {
  switch (value) {
    case 'system':
      return t('systemDefault')
    case 'en':
      return t('english')
    case 'zh-CN':
      return t('chinese')
    case 'logical':
      return t('outdentLogical')
    case 'traditional':
      return t('outdentTraditional')
    case 'sunday':
      return t('sunday')
    case 'monday':
      return t('monday')
    case 'todo-journal':
      return t('panelTodoFirst')
    case 'journal-todo':
      return t('panelJournalFirst')
    case 'download':
      return t('networkImagePasteDownload')
    case 'url':
      return t('networkImagePasteUrl')
    case 'publisher':
      return t('readerEpubPresentationPublisher')
    case 'reader':
      return t('readerEpubPresentationReader')
    case 'continuous':
      return t('readerPageModeContinuous')
    case 'single-page':
      return t('readerPageModeSinglePage')
    case 'text':
      return t('readerCopyTextOnly')
    case 'text-book':
      return t('readerCopyTextBook')
    case 'text-book-location':
      return t('readerCopyTextBookLocation')
    case 'webp':
      return 'WebP'
    case 'png':
      return 'PNG'
    case 'jpeg':
      return 'JPEG'
    case 'avif':
      return 'AVIF'
    case 'source':
      return t('sourceOrder')
    case 'random':
      return t('randomOrder')
    case 'before-reviews':
      return t('beforeReviews')
    case 'mixed':
      return t('mixedWithReviews')
    case 'after-reviews':
      return t('afterReviews')
    case 'due-random':
      return t('dueRandom')
    case 'retrievability':
      return t('retrievability')
    case 'spread-week':
      return t('spreadWeek')
    case 'all-due':
      return t('allDue')
    case 'fixed':
      return t('fixedDailyLimit')
    case 'archive-completed-to-today':
      return t('recurringTaskArchiveCompletedToToday')
    case 'move-next-to-today':
      return t('recurringTaskMoveNextToToday')
    case 'move-next-to-due-date':
      return t('recurringTaskMoveNextToDueDate')
    case 'nest-completed-under-next':
      return t('recurringTaskNestCompletedUnderNext')
    case 'place-next-after-completed':
      return t('recurringTaskPlaceNextAfterCompleted')
    case 'replace-completed':
      return t('recurringTaskReplaceCompleted')
    default:
      return value
  }
}

function translateUnit(unit: string | undefined, t: TFunction): string | undefined {
  switch (unit) {
    case 'cards':
      return t('cards')
    case 'minutes':
      return t('minutes')
    case 'backups':
      return t('backups')
    case 'hour':
      return t('hour')
    default:
      return unit
  }
}

function localizeSection(section: ConfigurationSection, t: TFunction): ConfigurationSection {
  return {
    ...section,
    label: translateSectionLabel(section.id, t),
    fields: section.fields.map((field) => {
      if (field.control === 'select' || field.control === 'segmented') {
        return {
          ...field,
          description: translateFieldDescription(field, t),
          label: translateFieldLabel(field, t),
          options: field.options.map(option => ({
            ...option,
            label: translateOptionLabel(option.value, t),
          })),
        }
      }
      return {
        ...field,
        description: translateFieldDescription(field, t),
        label: translateFieldLabel(field, t),
        ...(field.control === 'number' ? { unit: translateUnit(field.unit, t) } : {}),
      }
    }),
  }
}

interface SettingsCategory {
  readonly description: string
  readonly id: SettingsCategoryId
  readonly label: string
  readonly sections: readonly ConfigurationSection[]
  readonly showSectionHeadings: boolean
}

function buildSettingsCategories(
  sections: readonly ConfigurationSection[],
  t: TFunction,
  learningEnabled: boolean,
): readonly SettingsCategory[] {
  const sectionsById = new Map(sections.map(section => [section.id, section]))
  return settingsCategoryDefinitions.map((definition) => {
    const categorySections = definition.sectionIds
      .map((sectionId) => {
        const section = sectionsById.get(sectionId)
        if (!section)
          throw new Error(`Settings category ${definition.id} references missing section ${sectionId}`)
        return { id: sectionId, section }
      })
      .filter(({ id }) => learningEnabled || !learningDetailSectionIds.includes(id))
      .map(({ section }) => section)
    return {
      description: translateCategoryDescription(definition.id, t),
      id: definition.id,
      label: translateCategoryLabel(definition.id, t),
      sections: categorySections,
      showSectionHeadings: definition.showSectionHeadings === true,
    }
  })
}

function SettingsFieldsGroup({
  first,
  section,
  showHeading,
  store,
}: {
  first: boolean
  section: ConfigurationSection
  showHeading: boolean
  store: ConfigurationStore<DesktopConfiguration>
}) {
  const fields = (
    <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
      <ConfigurationFields fields={section.fields} store={store} />
    </div>
  )

  if (!showHeading)
    return fields

  const headingId = `${section.id}-settings-heading`
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        {...stylex.props(settingsStyles.sectionTitle, first && settingsStyles.sectionTitleFirst)}
      >
        {section.label}
      </h2>
      {fields}
    </section>
  )
}

function ThemeGallery({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const { t } = useTranslation('settings')
  const configuration = useDesktopConfiguration()
  const appearanceOptions = [
    { label: t('themeSystem'), value: 'system' },
    { label: t('themeLight'), value: 'light' },
    { label: t('themeDark'), value: 'dark' },
  ] as const

  return (
    <section {...stylex.props(settingsStyles.themeSection)} aria-labelledby="theme-settings-heading">
      <h2 id="theme-settings-heading" {...stylex.props(settingsStyles.sectionTitle, settingsStyles.sectionTitleFirst)}>
        {t('themeSection')}
      </h2>
      <fieldset {...stylex.props(settingsStyles.themeGallery)} aria-label={t('themeFamily')}>
        <legend {...stylex.props(settingsStyles.themeLegend)}>{t('themeFamily')}</legend>
        {getUiThemeDefinitions().map((definition) => {
          const selected = configuration.theme.family === definition.id
          const label = t(definition.labelKey)
          const description = t(definition.descriptionKey)
          const previewStyle = {
            backgroundColor: definition.preview.canvas,
          } as CSSProperties
          return (
            <label
              key={definition.id}
              {...stylex.props(settingsStyles.themeCard, selected && settingsStyles.themeCardSelected)}
            >
              <input
                {...stylex.props(settingsStyles.themeInput)}
                aria-label={label}
                checked={selected}
                name="theme-family"
                type="radio"
                value={definition.id}
                onChange={() => void store.setValue('theme.family', definition.id)}
              />
              <div {...stylex.props(settingsStyles.themePreview)} style={previewStyle}>
                <div {...stylex.props(settingsStyles.themePreviewSidebar)} style={{ backgroundColor: definition.preview.surface }} />
                <div {...stylex.props(settingsStyles.themePreviewContent)} style={{ backgroundColor: definition.preview.surface }}>
                  <div {...stylex.props(settingsStyles.themePreviewAccent)} style={{ backgroundColor: definition.preview.accent }} />
                  <div {...stylex.props(settingsStyles.themePreviewLine)} />
                  <div {...stylex.props(settingsStyles.themePreviewLine)} style={{ width: '52%' }} />
                </div>
              </div>
              <div {...stylex.props(settingsStyles.themeCardHeader)}>
                <span {...stylex.props(settingsStyles.themeCardName)}>{label}</span>
                {selected ? <span {...stylex.props(settingsStyles.themeSelection)} aria-hidden="true">✓</span> : null}
              </div>
              <p {...stylex.props(settingsStyles.themeCardDescription)}>{description}</p>
            </label>
          )
        })}
      </fieldset>
      <div {...stylex.props(settingsStyles.appearanceRow)}>
        <span {...stylex.props(settingsStyles.appearanceLabel)}>{t('themeAppearance')}</span>
        <SegmentedControl.Root
          value={configuration.theme.appearance}
          onValueChange={value => void store.setValue('theme.appearance', value)}
        >
          {appearanceOptions.map(option => (
            <SegmentedControl.Item key={option.value} value={option.value}>{option.label}</SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </div>
      <p {...stylex.props(settingsStyles.themeStatus)} role="status">{t('themeSaved')}</p>
    </section>
  )
}

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const { t } = useTranslation('settings')
  const configuration = useDesktopConfiguration()
  const localizedSections = desktopConfigurationDefinition.sections.map(section => localizeSection(section, t))
  const categories = buildSettingsCategories(localizedSections, t, configuration.learning.enabled)
  const [activeCategoryId, setActiveCategoryId] = useState<SettingsCategoryId>('general')
  const shouldReduceMotion = useReducedMotion()
  const activeCategory = categories.find(category => category.id === activeCategoryId)
  const windowProps = stylex.props(settingsStyles.window)

  if (!activeCategory)
    throw new Error(`Settings has no active category matching ${activeCategoryId}`)

  return (
    <main
      {...windowProps}
      className={windowProps.className}
    >
      <div {...stylex.props(settingsStyles.dragRegion)} data-window-drag="" />
      <div {...stylex.props(settingsStyles.layout)}>
        <Sidebar.Root aria-label={t('categories')} variant="settings">
          <Sidebar.Header>{t('title')}</Sidebar.Header>
          <Sidebar.Navigation aria-label={t('categories')}>
            {categories.map((category) => {
              const Icon = categoryIcons[category.id]
              const selected = category.id === activeCategory.id
              return (
                <Sidebar.Item
                  key={category.id}
                  aria-current={selected ? 'page' : undefined}
                  data-state={selected ? 'active' : 'inactive'}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <Sidebar.ItemIcon active={selected}><Icon aria-hidden="true" size={16} strokeWidth={2} /></Sidebar.ItemIcon>
                  <Sidebar.ItemLabel active={selected}>{category.label}</Sidebar.ItemLabel>
                </Sidebar.Item>
              )
            })}
          </Sidebar.Navigation>
        </Sidebar.Root>

        <section {...stylex.props(settingsStyles.contentPane)} aria-labelledby="active-settings-heading">
          <div {...stylex.props(settingsStyles.contentScroll)}>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeCategory.id}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -5 }}
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <header {...stylex.props(settingsStyles.contentHeader)}>
                  <h1 id="active-settings-heading" {...stylex.props(settingsStyles.pageTitle)}>{activeCategory.label}</h1>
                  <p {...stylex.props(settingsStyles.pageDescription)}>
                    {activeCategory.description}
                  </p>
                </header>
                {activeCategory.id === 'general' ? <ThemeGallery store={store} /> : null}
                {activeCategory.id === 'sync' ? <P2pSettings /> : null}
                {activeCategory.sections.map((section, index) => (
                  <Fragment key={section.id}>
                    <SettingsFieldsGroup
                      first={index === 0}
                      section={section}
                      showHeading={activeCategory.showSectionHeadings}
                      store={store}
                    />
                    {section.id === 'images' ? <AssetSettings /> : null}
                    {section.id === 'backup' ? <DatabaseSettings /> : null}
                    {section.id === 'todo' ? <CalendarSettings /> : null}
                  </Fragment>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  )
}
