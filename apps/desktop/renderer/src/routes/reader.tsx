import { createFileRoute } from '@tanstack/react-router'

import { ReaderLayout } from '../features/reader/reader-layout'

export const Route = createFileRoute('/reader')({ component: ReaderLayout })
