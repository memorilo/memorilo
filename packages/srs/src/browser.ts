import type { initOptimizer } from '@open-spaced-repetition/binding/dynamic-wasi'
import type { FsrsOptimizerConfiguration, RatingHistory, ReviewRating } from './types'
import optimizerWasmUrl from '@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm?url'
import optimizerWorkerUrl from '@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs?url'
import { validateOptimizerConfiguration } from './fsrs'

type BrowserOptimizerBinding = Awaited<ReturnType<typeof initOptimizer>>

let bindingPromise: Promise<BrowserOptimizerBinding> | null = null

async function loadBinding(): Promise<BrowserOptimizerBinding> {
  if (!bindingPromise) {
    bindingPromise = import('@open-spaced-repetition/binding/dynamic-wasi').then(async ({ initOptimizer: initialize }) => (
      initialize({
        wasm: optimizerWasmUrl,
        worker: optimizerWorkerUrl,
        errorEvent: true,
      })
    ) as Promise<BrowserOptimizerBinding>)
  }
  return bindingPromise!
}

function ratingNumber(rating: ReviewRating): number {
  switch (rating) {
    case 'again':
      return 1
    case 'hard':
      return 2
    case 'good':
      return 3
    case 'easy':
      return 4
  }
}

function orderedHistories(histories: readonly RatingHistory[]): readonly RatingHistory[] {
  return [...histories].sort((left, right) => left.targetId.localeCompare(right.targetId))
}

export async function optimizeFsrsParameters(
  histories: readonly RatingHistory[],
  configuration: FsrsOptimizerConfiguration,
  timeoutMilliseconds = 60_000,
): Promise<FsrsOptimizerConfiguration> {
  const binding = await loadBinding()
  const items = orderedHistories(histories).flatMap((history) => {
    const firstRating = history.ratings[0]
    if (!firstRating)
      return []
    let previous = firstRating.occurredAt
    const reviews = history.ratings.map((rating, index) => {
      const deltaDays = index === 0
        ? 0
        : Math.max(0, Math.round((rating.occurredAt - previous) / 86_400_000))
      previous = rating.occurredAt
      return new binding.FSRSBindingReview(ratingNumber(rating.rating), deltaDays)
    })
    return [new binding.FSRSBindingItem(reviews)]
  })
  if (items.length === 0)
    throw new Error('FSRS parameter optimization requires at least one Rating history')

  const weights = await binding.computeParameters(items, {
    enableShortTerm: true,
    numRelearningSteps: configuration.relearningSteps.length,
    timeout: timeoutMilliseconds,
  })
  return validateOptimizerConfiguration({
    ...configuration,
    fsrsParameters: weights,
  })
}
