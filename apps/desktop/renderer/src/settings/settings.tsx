import type { ConfigurationField, ConfigurationSection, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { TFunction } from 'i18next'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, GalleryVerticalEnd, Globe2, GraduationCap, Image, Settings2, Target, Waypoints } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../shared/configuration'
import { AssetSettings } from './asset-settings'
import { settingsShellStyles as settingsStyles } from './settings-shell.stylex'

const sectionIcons = {
  anki: Waypoints,
  editor: BookOpen,
  flashcards: GalleryVerticalEnd,
  general: Settings2,
  goals: Target,
  images: Image,
  learning: GraduationCap,
  reading: BookOpen,
} as const

function sectionIcon(sectionId: string) {
  return sectionId in sectionIcons
    ? sectionIcons[sectionId as keyof typeof sectionIcons]
    : Globe2
}

function translateSectionLabel(sectionId: string, t: TFunction): string {
  switch (sectionId) {
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
    case 'hour':
      return t('hour')
    default:
      return unit
  }
}

function translateSectionDescription(sectionId: string, t: TFunction): string {
  switch (sectionId) {
    case 'anki':
      return t('ankiDescription')
    case 'general':
      return t('generalDescription')
    case 'editor':
      return t('editorDescription')
    case 'flashcards':
      return t('flashcardsDescription')
    case 'goals':
      return t('goalsDescription')
    case 'images':
      return t('imagesDescription')
    case 'reading':
      return t('readingDescription')
    case 'mcp':
      return t('mcpDescription')
    case 'learning':
      return t('learningDescription')
    default:
      return ''
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

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const { t } = useTranslation('settings')
  const configuration = useDesktopConfiguration()
  const sections = desktopConfigurationDefinition.sections
    .filter(section => configuration.learning.enabled || !['anki', 'flashcards', 'goals'].includes(section.id))
    .map(section => localizeSection(section, t))
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id)
  const shouldReduceMotion = useReducedMotion()
  const activeSection = sections.find(section => section.id === activeSectionId) ?? sections[0]

  if (!activeSection)
    throw new Error('Settings has no active section')

  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.dragRegion)} data-window-drag="" />
      <div {...stylex.props(settingsStyles.layout)}>
        <aside {...stylex.props(settingsStyles.sidebar)} aria-label={t('categories')}>
          <div {...stylex.props(settingsStyles.sidebarHeader)}>
            <span {...stylex.props(settingsStyles.sidebarTitle)}>{t('title')}</span>
          </div>
          <nav {...stylex.props(settingsStyles.navigation)} aria-label={t('categories')}>
            {sections.map((section) => {
              const Icon = sectionIcon(section.id)
              const selected = section.id === activeSection.id
              return (
                <button
                  key={section.id}
                  {...stylex.props(settingsStyles.navigationItem, selected && settingsStyles.navigationItemSelected)}
                  aria-current={selected ? 'page' : undefined}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <Icon {...stylex.props(settingsStyles.navigationIcon, selected && settingsStyles.navigationIconSelected)} aria-hidden="true" size={16} strokeWidth={2} />
                  <span>{section.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section {...stylex.props(settingsStyles.contentPane)} aria-labelledby="active-settings-heading">
          <div {...stylex.props(settingsStyles.contentScroll)}>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeSection.id}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -5 }}
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <header {...stylex.props(settingsStyles.contentHeader)}>
                  <h1 id="active-settings-heading" {...stylex.props(settingsStyles.pageTitle)}>{activeSection.label}</h1>
                  <p {...stylex.props(settingsStyles.pageDescription)}>
                    {translateSectionDescription(activeSection.id, t)}
                  </p>
                </header>
                <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
                  <ConfigurationFields fields={activeSection.fields} store={store} />
                </div>
                {activeSection.id === 'images' ? <AssetSettings /> : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  )
}
