import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { LearningStorage } from '@memorilo/editor-storage'
import type { MergeIpcService } from 'electron-ipc-decorator'
import type { NoteApplicationService } from '../notes/note-application-service'
import { createServices } from 'electron-ipc-decorator'
import { createLearningReviewApplication } from '../learning/learning-review-application'

import { AppService } from './app-service'
import { createConfigurationService } from './configuration-service'
import { createLearningService } from './learning-service'
import { createNoteService } from './note-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  notes: NoteApplicationService,
  learning: LearningStorage,
  configuration: ConfigurationStore<DesktopConfiguration>,
) {
  const ConfigurationService = createConfigurationService(configuration)
  const LearningService = createLearningService(
    learning,
    createLearningReviewApplication(notes, learning),
  )
  const NoteService = createNoteService(notes)
  return createServices([
    AppService,
    ConfigurationService,
    LearningService,
    NoteService,
    WindowService,
  ] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
