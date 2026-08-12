import type { NodeJSON } from 'prosekit/core'
import type { EditorCardRepository } from './card-repository'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
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
  close: () => Promise<void>
  flush: () => Promise<void>
  schedule: (document: NodeJSON) => Promise<void>
}

export class EditorCardSyncClosedError extends Error {
  constructor() {
    super('Editor Card sync is closed')
    this.name = 'EditorCardSyncClosedError'
  }
}

export function createEditorCardSync(options: EditorCardSyncOptions): EditorCardSync {
  const operations = createOperationSupervisor('Editor Card sync', {
    closedError: () => new EditorCardSyncClosedError(),
  })
  let closing = false

  const report = (input: EditorCardSyncError) => {
    try {
      options.onSyncError(input)
    }
    catch (error) {
      console.error('Editor Card sync error listener failed', error)
    }
  }

  const schedule = (document: NodeJSON) => {
    return operations.run(async () => {
      let cards
      try {
        cards = projectEditorCards(document)
      }
      catch (error) {
        report({
          error,
          noteId: options.noteId,
          phase: 'projection',
          topicId: options.topicId,
        })
        return
      }

      try {
        await options.repository.replaceTopicCards({
          cards,
          noteId: options.noteId,
          topicId: options.topicId,
        })
      }
      catch (error) {
        report({
          error,
          noteId: options.noteId,
          phase: 'repository',
          topicId: options.topicId,
        })
      }
    })
  }

  const close = () => {
    closing = true
    return operations.close()
  }

  return {
    close,
    flush: () => closing ? operations.close() : operations.run(async () => {}),
    schedule,
  }
}
