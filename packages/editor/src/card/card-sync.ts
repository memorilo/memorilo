import type { NodeJSON } from 'prosekit/core'
import type { EditorCardRepository } from './card-repository'
import { projectEditorCards } from './card-model'

export interface EditorCardSyncError {
  error: unknown
  noteId: string
  phase: 'projection' | 'repository'
  topicId: string
}

export interface EditorCardIntegration {
  onSyncError: (input: EditorCardSyncError) => void
  repository: EditorCardRepository
}

interface EditorCardSyncOptions extends EditorCardIntegration {
  noteId: string
  topicId: string
}

export interface EditorCardSync {
  flush: () => Promise<void>
  schedule: (document: NodeJSON) => void
}

export function createEditorCardSync(options: EditorCardSyncOptions): EditorCardSync {
  let queue = Promise.resolve()

  return {
    flush: () => queue,
    schedule: (document) => {
      let cards
      try {
        cards = projectEditorCards(document)
      }
      catch (error) {
        options.onSyncError({
          error,
          noteId: options.noteId,
          phase: 'projection',
          topicId: options.topicId,
        })
        return
      }

      queue = queue
        .then(() => options.repository.replaceTopicCards({
          cards,
          noteId: options.noteId,
          topicId: options.topicId,
        }))
        .catch((error: unknown) => {
          options.onSyncError({
            error,
            noteId: options.noteId,
            phase: 'repository',
            topicId: options.topicId,
          })
        })
    },
  }
}
