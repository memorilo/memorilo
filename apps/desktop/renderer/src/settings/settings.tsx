import type { ConfigurationField, ConfigurationSection, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { TFunction } from 'i18next'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, GraduationCap, HardDrive, NotebookPen, Plug, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../shared/configuration'
import { AssetSettings } from './asset-settings'
import { DatabaseSettings } from './database-settings'
import { settingsShellStyles as settingsStyles } from './settings-shell.stylex'

type SettingsCategoryId = 'editor' | 'general' | 'learning' | 'mcp' | 'media' | 'reading'
type SourceSectionId = 'anki' | 'backup' | 'editor' | 'flashcards' | 'general' | 'goals' | 'images' | 'learning' | 'mcp' | 'reading'

interface SettingsCategoryDefinition {
  readonly id: SettingsCategoryId
  readonly sectionIds: readonly SourceSectionId[]
  readonly showSectionHeadings?: boolean
}

const settingsCategoryDefinitions: readonly SettingsCategoryDefinition[] = [
  { id: 'general', sectionIds: ['general'] },
  { id: 'editor', sectionIds: ['editor'] },
  { id: 'reading', sectionIds: ['reading'] },
  { id: 'learning', sectionIds: ['learning', 'goals', 'flashcards', 'anki'], showSectionHeadings: true },
  { id: 'media', sectionIds: ['images', 'backup'], showSectionHeadings: true },
  { id: 'mcp', sectionIds: ['mcp'] },
]

const learningDetailSectionIds: readonly SourceSectionId[] = ['anki', 'flashcards', 'goals']

const categoryIcons = {
  editor: NotebookPen,
  general: Settings2,
  learning: GraduationCap,
  mcp: Plug,
  media: HardDrive,
  reading: BookOpen,
} as const

function translateCategoryLabel(categoryId: SettingsCategoryId, t: TFunction): string {
  switch (categoryId) {
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
  }
}

function translateCategoryDescription(categoryId: SettingsCategoryId, t: TFunction): string {
  switch (categoryId) {
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
  }
}

function translateSectionLabel(sectionId: string, t: TFunction): string {
  switch (sectionId) {
    case 'backup':
      return t('backupSection')
    case 'anki':
      return t('ankiSection')
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
    case 'anki.enabled':
      return t('ankiEnabled')
    case 'anki.host':
      return t('ankiHost')
    case 'anki.port':
      return t('ankiPort')
    case 'anki.apiKey':
      return t('ankiApiKey')
    case 'language':
      return t('language')
    case 'reduceMotion':
      return t('reduceMotion')
    case 'defaultNoteLearningEnabled':
      return t('defaultNoteLearningEnabled')
    case 'weekStart':
      return t('weekStart')
    case 'outdentBehavior':
      return t('outdentBehavior')
    case 'networkImagePasteBehavior':
      return t('networkImagePasteBehavior')
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
    case 'anki.enabled':
      return t('ankiEnabledDescription')
    case 'anki.host':
      return t('ankiHostDescription')
    case 'anki.port':
      return t('ankiPortDescription')
    case 'anki.apiKey':
      return t('ankiApiKeyDescription')
    case 'outdentBehavior':
      return t('outdentBehaviorDescription')
    case 'defaultNoteLearningEnabled':
      return t('defaultNoteLearningEnabledDescription')
    case 'weekStart':
      return t('weekStartDescription')
    case 'networkImagePasteBehavior':
      return t('networkImagePasteBehaviorDescription')
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

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const { t } = useTranslation('settings')
  const configuration = useDesktopConfiguration()
  const localizedSections = desktopConfigurationDefinition.sections.map(section => localizeSection(section, t))
  const categories = buildSettingsCategories(localizedSections, t, configuration.learning.enabled)
  const [activeCategoryId, setActiveCategoryId] = useState<SettingsCategoryId>('general')
  const shouldReduceMotion = useReducedMotion()
  const activeCategory = categories.find(category => category.id === activeCategoryId)

  if (!activeCategory)
    throw new Error(`Settings has no active category matching ${activeCategoryId}`)

  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.dragRegion)} data-window-drag="" />
      <div {...stylex.props(settingsStyles.layout)}>
        <aside {...stylex.props(settingsStyles.sidebar)} aria-label={t('categories')}>
          <div {...stylex.props(settingsStyles.sidebarHeader)}>
            <span {...stylex.props(settingsStyles.sidebarTitle)}>{t('title')}</span>
          </div>
          <nav {...stylex.props(settingsStyles.navigation)} aria-label={t('categories')}>
            {categories.map((category) => {
              const Icon = categoryIcons[category.id]
              const selected = category.id === activeCategory.id
              return (
                <button
                  key={category.id}
                  {...stylex.props(settingsStyles.navigationItem, selected && settingsStyles.navigationItemSelected)}
                  aria-current={selected ? 'page' : undefined}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <Icon {...stylex.props(settingsStyles.navigationIcon, selected && settingsStyles.navigationIconSelected)} aria-hidden="true" size={16} strokeWidth={2} />
                  <span>{category.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

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
