import type { KeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../../shared/page-titlebar'
import { learningRouteStyles } from './learning.stylex'
import { LearningNotesPanel } from './notes/learning-notes'
import { LearningOptimizerPanel } from './optimizer/learning-optimizer-panel'

const tabSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.24,
} as const
const learningTabs = [
  { id: 'notes', labelKey: 'notesTab' },
  { id: 'optimizer', labelKey: 'optimizerTab' },
] as const

export type LearningTabId = typeof learningTabs[number]['id']

export interface LearningSearch {
  view?: LearningTabId
}

function tabElementId(tabId: LearningTabId) {
  return `learning-${tabId}-tab`
}

function panelElementId(tabId: LearningTabId) {
  return `learning-${tabId}-panel`
}

export function LearningPage({
  onOpenOptimizer,
  onViewChange,
  view,
}: {
  onOpenOptimizer: (optimizerId: string) => Promise<void> | void
  onViewChange: (view: LearningTabId) => Promise<void> | void
  view?: LearningTabId
}) {
  const { t } = useTranslation('learning')
  const titlebar = useMemo(() => ({
    title: t('title'),
    trailing: (
      <Link
        {...stylex.props(learningRouteStyles.startReviewButton)}
        aria-label={t('startGlobalReview')}
        search={{ scope: 'global' }}
        title={t('startGlobalReview')}
        to="/learning/review"
      >
        <Play aria-hidden="true" fill="currentColor" size={12} strokeWidth={1.8} />
        <span>{t('startReview')}</span>
      </Link>
    ),
  }), [t])
  usePageTitlebar(titlebar)
  const activeTab = view ?? 'notes'
  const tabRefs = useRef<Partial<Record<LearningTabId, HTMLButtonElement>>>({})
  const shouldReduceMotion = useReducedMotion()

  const selectTab = (tabId: LearningTabId) => {
    void onViewChange(tabId)
  }

  const focusTab = (tabId: LearningTabId) => {
    const tab = tabRefs.current[tabId]
    if (!tab)
      throw new Error(`Learning tab ${tabId} is not mounted`)
    selectTab(tabId)
    tab.focus()
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: LearningTabId) => {
    const currentIndex = learningTabs.findIndex(tab => tab.id === tabId)
    if (currentIndex < 0)
      throw new Error(`Unknown Learning tab: ${tabId}`)

    let nextIndex: number
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + learningTabs.length) % learningTabs.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % learningTabs.length
        break
      case 'End':
        nextIndex = learningTabs.length - 1
        break
      case 'Home':
        nextIndex = 0
        break
      default:
        return
    }

    event.preventDefault()
    const nextTab = learningTabs[nextIndex]
    if (!nextTab)
      throw new RangeError(`Learning tab index ${nextIndex} is outside the tab list`)
    focusTab(nextTab.id)
  }

  return (
    <main {...stylex.props(learningRouteStyles.page)} aria-label={t('title')}>
      <div {...stylex.props(learningRouteStyles.tabRegion)}>
        <div
          {...stylex.props(learningRouteStyles.tabList)}
          aria-label={t('viewsLabel')}
          role="tablist"
        >
          {learningTabs.map(tab => (
            <button
              key={tab.id}
              ref={(element) => {
                if (element)
                  tabRefs.current[tab.id] = element
                else
                  delete tabRefs.current[tab.id]
              }}
              {...stylex.props(
                learningRouteStyles.tab,
                activeTab === tab.id && learningRouteStyles.tabSelected,
              )}
              id={tabElementId(tab.id)}
              aria-controls={panelElementId(tab.id)}
              aria-selected={activeTab === tab.id}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
              onClick={() => selectTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, tab.id)}
            >
              {activeTab === tab.id
                ? (
                    <motion.span
                      {...stylex.props(learningRouteStyles.selectionIndicator)}
                      aria-hidden="true"
                      initial={false}
                      layoutId="learning-tab-selection"
                      transition={shouldReduceMotion ? { duration: 0 } : tabSpring}
                    />
                  )
                : null}
              <span {...stylex.props(learningRouteStyles.tabLabel)}>{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div {...stylex.props(learningRouteStyles.panelRegion)}>
        {learningTabs.map(tab => (
          <section
            key={tab.id}
            {...stylex.props(learningRouteStyles.panel)}
            id={panelElementId(tab.id)}
            aria-labelledby={tabElementId(tab.id)}
            hidden={activeTab !== tab.id}
            role="tabpanel"
          >
            {tab.id === 'notes' && activeTab === 'notes' ? <LearningNotesPanel /> : null}
            {tab.id === 'optimizer' && activeTab === 'optimizer'
              ? <LearningOptimizerPanel onOpenOptimizer={onOpenOptimizer} />
              : null}
          </section>
        ))}
      </div>
    </main>
  )
}
