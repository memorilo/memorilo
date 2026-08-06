import type { MultiLineItemSchedule, ReviewRating } from './index'
import { describe, expect, it } from 'vitest'
import {
  aggregateMultiLineRating,
  isStrugglingMultiLineItem,
  selectMultiLinePresentation,
} from './index'

function item(
  targetId: string,
  ratings: readonly ReviewRating[],
  dueAt = 2_000,
): MultiLineItemSchedule {
  return { dueAt, ratings, targetId }
}

describe('remNote multi-line main rating aggregation', () => {
  it('rejects an empty or unsupported item rating collection', () => {
    expect(() => aggregateMultiLineRating([])).toThrow('at least one item Rating')
    expect(() => aggregateMultiLineRating(['unsupported' as ReviewRating]))
      .toThrow('Unsupported multi-line Rating: unsupported')
  })

  it.each([
    [['again'], 'again'],
    [['hard'], 'hard'],
    [['good'], 'good'],
    [['easy'], 'easy'],
    [['again', 'again', 'hard', 'good'], 'again'],
    [['again', 'hard', 'hard', 'good'], 'hard'],
    [['hard', 'easy', 'easy', 'easy'], 'easy'],
    [['good', 'good', 'easy', 'easy'], 'good'],
    [['again', 'again', 'hard', 'good', 'easy'], 'again'],
    [['again', 'hard', 'easy', 'easy', 'easy'], 'easy'],
  ] as const)('aggregates %j as %s', (ratings, expected) => {
    expect(aggregateMultiLineRating(ratings)).toBe(expected)
  })
})

describe('remNote multi-line struggling-item detection', () => {
  it.each([
    [[], false],
    [['good'], false],
    [['hard'], true],
    [['good', 'again'], true],
    [['again', 'good', 'easy'], false],
    [['easy', 'hard', 'good'], true],
  ] as const)('uses only the latest two Ratings in %j', (ratings, expected) => {
    expect(isStrugglingMultiLineItem(ratings)).toBe(expected)
  })
})

describe('remNote full and partial multi-line presentation', () => {
  it('rejects missing and duplicate item Targets', () => {
    expect(() => selectMultiLinePresentation({
      items: [],
      mainDueAt: 2_000,
      now: 1_000,
    })).toThrow('at least one item Target')
    expect(() => selectMultiLinePresentation({
      items: [item('duplicate', ['good']), item('duplicate', ['hard'])],
      mainDueAt: 2_000,
      now: 1_000,
    })).toThrow('duplicate item Target duplicate')
  })

  it('shows the full Card when the main Card is due', () => {
    expect(selectMultiLinePresentation({
      items: [item('hard', ['again']), item('stable', ['good'])],
      mainDueAt: 1_000,
      now: 1_000,
    })).toEqual({ presentation: 'full', targetIds: ['hard', 'stable'] })
  })

  it('shows the full Card when no item is struggling', () => {
    expect(selectMultiLinePresentation({
      items: [item('first', ['again', 'good', 'easy']), item('second', ['good'])],
      mainDueAt: 2_000,
      now: 1_000,
    })).toEqual({ presentation: 'full', targetIds: ['first', 'second'] })
  })

  it('shows the full Card instead of a Partial when every item is selected', () => {
    expect(selectMultiLinePresentation({
      items: [item('again', ['again']), item('hard', ['hard'], 900)],
      mainDueAt: 2_000,
      now: 1_000,
    })).toEqual({ presentation: 'full', targetIds: ['again', 'hard'] })
  })

  it('selects the worst recent items plus other due struggling items for Partial', () => {
    expect(selectMultiLinePresentation({
      items: [
        item('worst-future', ['again', 'good'], 3_000),
        item('hard-due', ['hard'], 900),
        item('hard-future', ['hard'], 3_000),
        item('stable', ['good'], 800),
      ],
      mainDueAt: 4_000,
      now: 1_000,
    })).toEqual({
      presentation: 'partial',
      targetIds: ['worst-future', 'hard-due'],
    })
  })
})
