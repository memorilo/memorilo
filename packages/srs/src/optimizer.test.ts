import type { FsrsOptimizerConfiguration, RatingHistory } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultOptimizerConfiguration,
  fingerprintRatingHistories,
  optimizeFsrsParameters,
} from './index'

const binding = vi.hoisted(() => ({
  computeParameters: vi.fn(),
}))

vi.mock('@open-spaced-repetition/binding', () => {
  class FSRSBindingReview {
    readonly deltaDays: number
    readonly rating: number

    constructor(rating: number, deltaDays: number) {
      this.deltaDays = deltaDays
      this.rating = rating
    }
  }

  class FSRSBindingItem {
    readonly reviews: readonly FSRSBindingReview[]

    constructor(reviews: readonly FSRSBindingReview[]) {
      this.reviews = reviews
    }
  }

  return {
    computeParameters: binding.computeParameters,
    FSRSBindingItem,
    FSRSBindingReview,
  }
})

let configuration: FsrsOptimizerConfiguration

beforeEach(() => {
  binding.computeParameters.mockReset()
  configuration = { ...defaultOptimizerConfiguration(), enableFuzz: false }
  binding.computeParameters.mockResolvedValue([...configuration.fsrsParameters])
})

describe('fsrs parameter optimization', () => {
  it('fingerprints histories in target order while preserving Rating order', () => {
    const targetA: RatingHistory = {
      ratings: [
        { eventId: 'event-a', occurredAt: 1_710_000_000_000, rating: 'good' },
        { eventId: 'event-b', occurredAt: 1_710_086_400_000, rating: 'again' },
      ],
      targetId: 'target-a',
    }
    const targetB: RatingHistory = {
      ratings: [{ eventId: 'event-c', occurredAt: 1_710_172_800_000, rating: 'easy' }],
      targetId: 'target-b',
    }

    expect(fingerprintRatingHistories([targetB, targetA])).toBe(
      'e82a266f2525440ea73c50906c68d32c9c662ca0bcc35418e68cf51147887995',
    )
    expect(fingerprintRatingHistories([])).toBe(
      '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    )
  })

  it('converts every Rating and rounded elapsed day before training', async () => {
    const day = 86_400_000
    const histories: readonly RatingHistory[] = [
      {
        ratings: [{ eventId: 'b-1', occurredAt: day, rating: 'good' }],
        targetId: 'target-b',
      },
      { ratings: [], targetId: 'empty' },
      {
        ratings: [
          { eventId: 'a-1', occurredAt: 0, rating: 'again' },
          { eventId: 'a-2', occurredAt: 1.6 * day, rating: 'hard' },
          { eventId: 'a-3', occurredAt: 1.1 * day, rating: 'good' },
          { eventId: 'a-4', occurredAt: 3.1 * day, rating: 'easy' },
        ],
        targetId: 'target-a',
      },
    ]

    await expect(optimizeFsrsParameters(histories, configuration, 123)).resolves.toEqual(configuration)
    expect(binding.computeParameters).toHaveBeenCalledOnce()
    expect(binding.computeParameters).toHaveBeenCalledWith([
      {
        reviews: [
          { deltaDays: 0, rating: 1 },
          { deltaDays: 2, rating: 2 },
          { deltaDays: 0, rating: 3 },
          { deltaDays: 2, rating: 4 },
        ],
      },
      { reviews: [{ deltaDays: 0, rating: 3 }] },
    ], {
      enableShortTerm: true,
      numRelearningSteps: configuration.relearningSteps.length,
      timeout: 123,
    })
  })

  it('uses the default timeout and rejects empty training data', async () => {
    const history: RatingHistory = {
      ratings: [{ eventId: 'event', occurredAt: 0, rating: 'easy' }],
      targetId: 'target',
    }

    await optimizeFsrsParameters([history], configuration)
    expect(binding.computeParameters).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeout: 60_000 }),
    )

    await expect(optimizeFsrsParameters([
      { ratings: [], targetId: 'empty' },
    ], configuration)).rejects.toThrow(
      new Error('FSRS parameter optimization requires at least one Rating history'),
    )
  })
})
