import { createFileRoute } from '@tanstack/react-router'

import { PanelPage } from '../features/panel/panel-page'

export const Route = createFileRoute('/panel')({ component: PanelPage })
