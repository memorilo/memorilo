import type { EditorCardProjection } from './card-model'

export type CardReviewSide = 'answer' | 'question'

export interface CardReviewItemSelection {
  label: (itemBlockId: string, selected: boolean) => string
  onToggle: (itemBlockId: string) => void
  selectedItemBlockIds: readonly string[]
}

export interface CardReviewOptions {
  active: boolean
  card: EditorCardProjection
  itemSelection?: CardReviewItemSelection
  revealedItemBlockIds?: readonly string[]
  side: CardReviewSide
}

export class CardReviewRuntime {
  private listeners = new Set<() => void>()
  private snapshot: CardReviewOptions

  constructor(options: CardReviewOptions) {
    this.snapshot = options
  }

  getSnapshot = (): CardReviewOptions => this.snapshot

  setOptions(options: CardReviewOptions): void {
    if (options === this.snapshot)
      return
    this.snapshot = options
    for (const listener of [...this.listeners]) {
      try {
        listener()
      }
      catch (error) {
        console.error('Card review runtime listener failed', error)
      }
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
