import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../components/page-titlebar'

export const Route = createFileRoute('/journals')({
  component: JournalsRoute,
})

function JournalsRoute() {
  const { t } = useTranslation('app')
  usePageTitlebar({ title: t('journals') })
  return null
}
