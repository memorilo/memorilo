import type {
  AssetReferenceProjection,
  NoteEntryProjection,
  TopicContentProjection,
} from './editor-storage-contracts'
import { describe, expect, it } from 'vitest'
import {
  contentHash,
  validateAssetReferences,
  validateJournalProjection,
  validateProjectionPatch,
} from './editor-storage-validation'

const topic: NoteEntryProjection = {
  id: 'topic-1',
  kind: 'topic',
  mode: 0,
  ordinal: 0,
  parentId: null,
  title: 'Topic',
  topicType: 'regular',
}

const projection: TopicContentProjection = {
  blocks: [{
    attributes: {},
    id: 'block-1',
    kind: 'outline',
    ordinal: 0,
    parentId: null,
    text: 'Content',
  }],
  title: 'Topic',
  topicId: 'topic-1',
}

describe('editor storage projection validation', () => {
  it('accepts a canonical Journal projection and rejects partial Journal state', () => {
    expect(() => validateJournalProjection([topic], [projection])).not.toThrow()
    expect(() => validateJournalProjection(undefined, [projection])).toThrow('complete Note entry projection')
    expect(() => validateJournalProjection([topic], [])).toThrow('complete root Topic projection')
  })

  it('rejects hierarchy collisions while preserving partial projection support', () => {
    expect(() => validateProjectionPatch(undefined, [projection])).not.toThrow()
    expect(() => validateProjectionPatch([
      topic,
      { ...topic, id: 'topic-2' },
    ], [])).toThrow('Duplicate NoteEntry ordinal')
    expect(() => validateProjectionPatch([topic], [{ ...projection, title: 'Renamed' }])).toThrow('does not match')
  })

  it('validates asset references and produces stable content hashes', () => {
    const reference: AssetReferenceProjection = { count: 1, fileName: 'a1b2c3.png' }
    expect(() => validateAssetReferences([reference])).not.toThrow()
    expect(() => validateAssetReferences([reference, reference])).toThrow('Duplicate asset reference')
    expect(() => validateAssetReferences([{ ...reference, count: 0 }])).toThrow('positive integer')
    expect(contentHash('same')).toBe(contentHash('same'))
    expect(contentHash('same')).not.toBe(contentHash('different'))
  })
})
