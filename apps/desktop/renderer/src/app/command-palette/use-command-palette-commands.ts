import type { TFunction } from 'i18next'
import type { PaletteCommand } from '../../shared/command-palette'
import { ArrowLeft, ArrowRight, CalendarDays, Files, PanelLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { router } from '../router'

interface HistoryPosition {
  index: number
  maxIndex: number
}

interface PaletteCommandsInput {
  contextualCommands: readonly PaletteCommand[]
  onToggleSidebar: () => void
  sidebarVisible: boolean
  t: TFunction
}

function historyIndex(): number {
  return router.history.location.state.__TSR_index
}

export function useCommandPaletteCommands({
  contextualCommands,
  onToggleSidebar,
  sidebarVisible,
  t,
}: PaletteCommandsInput): readonly PaletteCommand[] {
  const [historyPosition, setHistoryPosition] = useState<HistoryPosition>(() => {
    const index = historyIndex()
    return { index, maxIndex: index }
  })

  useEffect(() => router.history.subscribe(({ action, location }) => {
    const index = location.state.__TSR_index
    setHistoryPosition(current => ({
      index,
      maxIndex: action.type === 'PUSH' ? index : Math.max(current.maxIndex, index),
    }))
  }), [])

  return useMemo<readonly PaletteCommand[]>(() => {
    const navigation: PaletteCommand[] = [
      {
        accent: 'blue',
        action: t('open'),
        description: t('openJournalsDescription'),
        icon: CalendarDays,
        id: 'open-journals',
        keywords: t('openJournalsKeywords') as unknown as readonly string[],
        label: t('openJournals'),
        run: () => router.navigate({ to: '/journals' }),
        section: t('navigationSection') as PaletteCommand['section'],
      },
      {
        accent: 'violet',
        action: t('open'),
        description: t('openPagesDescription'),
        icon: Files,
        id: 'open-pages',
        keywords: t('openPagesKeywords') as unknown as readonly string[],
        label: t('openPages'),
        run: () => router.navigate({ to: '/pages' }),
        section: t('navigationSection') as PaletteCommand['section'],
      },
    ]
    const history: PaletteCommand[] = []
    if (historyPosition.index > 0) {
      history.push({
        accent: 'graphite',
        action: t('go'),
        description: t('goBackDescription'),
        icon: ArrowLeft,
        id: 'go-back',
        keywords: t('goBackKeywords') as unknown as readonly string[],
        label: t('goBack'),
        run: () => router.history.back(),
        section: t('historySection') as PaletteCommand['section'],
      })
    }
    if (historyPosition.index < historyPosition.maxIndex) {
      history.push({
        accent: 'graphite',
        action: t('go'),
        description: t('goForwardDescription'),
        icon: ArrowRight,
        id: 'go-forward',
        keywords: t('goForwardKeywords') as unknown as readonly string[],
        label: t('goForward'),
        run: () => router.history.forward(),
        section: t('historySection') as PaletteCommand['section'],
      })
    }
    return [
      ...contextualCommands,
      ...navigation,
      ...history,
      {
        accent: 'graphite',
        action: t('toggle'),
        description: sidebarVisible ? t('toggleSidebarDescription') : t('toggleSidebarDescriptionShow'),
        icon: PanelLeft,
        id: 'toggle-sidebar',
        keywords: t('toggleSidebarKeywords') as unknown as readonly string[],
        label: t('toggleSidebar'),
        run: onToggleSidebar,
        section: t('windowSection') as PaletteCommand['section'],
      },
    ]
  }, [t, contextualCommands, historyPosition.index, historyPosition.maxIndex, onToggleSidebar, sidebarVisible])
}
