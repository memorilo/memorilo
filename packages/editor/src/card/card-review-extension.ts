import type { Extension } from 'prosekit/core'
import type { CardReviewRuntime } from './card-review-runtime'
import i18next from 'i18next'
import { definePlugin } from 'prosekit/core'
import { Plugin, PluginKey } from 'prosekit/pm/state'
import {
  createCardReviewDecorations,
  syncCardReviewMathDisplays,
} from './card-review-projection'

const cardReviewPluginKey = new PluginKey<number>('memorilo-card-review')

export function defineCardReviewExtension(runtime: CardReviewRuntime): Extension {
  return definePlugin(new Plugin<number>({
    key: cardReviewPluginKey,
    state: {
      init: () => 0,
      apply: (transaction, revision) => transaction.getMeta(cardReviewPluginKey) ? revision + 1 : revision,
    },
    props: {
      decorations: (state) => {
        cardReviewPluginKey.getState(state)
        return createCardReviewDecorations(state.doc, runtime.getSnapshot())
      },
    },
    view: (view) => {
      const refresh = (): void => {
        if (!view.isDestroyed)
          view.dispatch(view.state.tr.setMeta(cardReviewPluginKey, true))
      }
      const unsubscribe = runtime.subscribe(refresh)
      i18next.on('languageChanged', refresh)
      syncCardReviewMathDisplays(view, runtime.getSnapshot())
      return {
        destroy: () => {
          unsubscribe()
          i18next.off('languageChanged', refresh)
        },
        update: nextView => syncCardReviewMathDisplays(nextView, runtime.getSnapshot()),
      }
    },
  }))
}
