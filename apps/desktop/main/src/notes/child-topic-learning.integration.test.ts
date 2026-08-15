import type { DesktopReviewItem } from '@memorilo/desktop-preload'
import type { EditorStorage, ReviewRating } from '@memorilo/editor-storage'
import type { EditorNote } from '@memorilo/editor/note'
import { SqliteEditorStorage } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { afterEach, describe, expect, it } from 'vitest'
import { createLearningReviewApplication } from '../learning/learning-review-application'
import { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { createNoteApplicationService } from './note-application-service'

const embeddingModel = {
  dimensions: 3,
  embedDocuments: async (texts: readonly string[]) => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
  id: 'test/child-topic-learning',
}

type NodeJSON = Extract<ReturnType<EditorNote['getTopicValidationInput']>, { document: unknown }>['document']

type ChildKind = 'basic' | 'cloze' | 'highlight' | 'list' | 'set'

interface ChildTopicScenario {
  cardId: string
  kind: ChildKind
  sourceId: string
  topicId: string
}

interface ChildTopicLearningFixture {
  children: readonly ChildTopicScenario[]
  database: BetterSqliteDatabase
  initialBlockId: string
  noteId: string
  notes: ReturnType<typeof createNoteApplicationService>
  renderer: ReturnType<typeof createEditorNote>
  sourceTopicId: string
  storage: EditorStorage
}

const fixtures: ChildTopicLearningFixture[] = []

function text(textContent: string, marks?: NodeJSON['marks']): NodeJSON {
  return { ...(marks ? { marks } : {}), text: textContent, type: 'text' }
}

function paragraph(...content: readonly NodeJSON[]): NodeJSON {
  return { content: [...content], type: 'paragraph' }
}

function delimiter(definitionId: string, cardId: string): NodeJSON {
  return {
    attrs: {
      backwardCardId: null,
      definitionId,
      direction: 'forward',
      forwardCardId: cardId,
    },
    type: 'cardDelimiter',
  }
}

function clozeMark(cardId: string, definitionId: string, groupId: string): NonNullable<NodeJSON['marks']>[number] {
  return {
    attrs: { anchorKind: 'rich-content', cardId, definitionId, groupId },
    type: 'cloze',
  }
}

function highlightMark(id: string): NonNullable<NodeJSON['marks']>[number] {
  return { attrs: { color: 'yellow', id }, type: 'inlineHighlight' }
}

function insertBlock(
  blockId: string,
  content: readonly NodeJSON[],
  kind: string,
  attributes?: Readonly<Record<string, unknown>>,
  parentId?: string,
): {
  attributes?: Readonly<Record<string, unknown>>
  blockId: string
  content: readonly NodeJSON[]
  kind: string
  operation: 'insert-block'
  parentId?: string
} {
  return {
    ...(attributes === undefined ? {} : { attributes }),
    blockId,
    content,
    kind,
    operation: 'insert-block',
    ...(parentId === undefined ? {} : { parentId }),
  }
}

function sourceEdits(initialBlockId: string) {
  return [
    {
      blockId: initialBlockId,
      content: [paragraph(
        text('Basic question'),
        delimiter('basic-definition', 'basic-card'),
        text('Basic answer'),
      )],
      operation: 'update-block-content' as const,
    },
    insertBlock('list-source', [paragraph(text('List question'), delimiter('list-definition', 'list-card'))], 'outline'),
    insertBlock('list-item-one', [paragraph(text('First list answer'))], 'ordered', {
      cardItemDefinitionId: 'list-definition',
      order: 1,
    }, 'list-source'),
    insertBlock('list-item-two', [paragraph(text('Second list answer'))], 'ordered', {
      cardItemDefinitionId: 'list-definition',
      order: 2,
    }, 'list-source'),
    insertBlock('set-source', [paragraph(text('Set question'), delimiter('set-definition', 'set-card'))], 'outline'),
    insertBlock('set-item-one', [paragraph(text('First set answer'))], 'bullet', {
      cardItemDefinitionId: 'set-definition',
    }, 'set-source'),
    insertBlock('set-item-two', [paragraph(text('Second set answer'))], 'bullet', {
      cardItemDefinitionId: 'set-definition',
    }, 'set-source'),
    insertBlock('cloze-source', [paragraph(
      text('Cloze selection', [clozeMark('cloze-card', 'cloze-definition', 'cloze-group')]),
      text(' is hidden'),
      text('Second cloze selection', [clozeMark('second-cloze-card', 'second-cloze-definition', 'second-cloze-group')]),
    )], 'outline'),
    insertBlock('inline-source', [paragraph(
      text('Inline selection', [highlightMark('inline-highlight')]),
      text(' is emphasized '),
      text('Second inline selection', [highlightMark('second-inline-highlight')]),
    )], 'outline'),
    insertBlock('block-highlight-source', [paragraph(text('Whole highlighted block'))], 'outline', {
      blockHighlight: 'blue',
      blockHighlightId: 'block-highlight',
    }),
  ]
}

function editableDocument(
  note: ReturnType<typeof createEditorNote>,
  topicId: string,
): NodeJSON {
  const validation = note.getTopicValidationInput(topicId)
  if (!('document' in validation))
    throw new TypeError(`Topic ${topicId} does not contain an editable document`)
  return validation.document
}

function firstBlock(document: NodeJSON): NodeJSON {
  const block = document.content?.find(node => node.type === 'list')
  if (!block)
    throw new Error('Expected a source Block')
  return block
}

function ownBlockContent(block: NodeJSON): NodeJSON[] {
  return structuredClone((block.content ?? []).filter(node => node.type !== 'list'))
}

function addMarkToFirstText(node: NodeJSON, mark: NonNullable<NodeJSON['marks']>[number]): boolean {
  if (typeof node.text === 'string') {
    node.marks = [...(node.marks ?? []), mark]
    return true
  }
  return node.content?.some(child => addMarkToFirstText(child, mark)) ?? false
}

function childScenarios(note: ReturnType<typeof createEditorNote>, sourceTopicId: string): readonly ChildTopicScenario[] {
  return note.getEntries().flatMap((entry) => {
    if (entry.kind !== 'topic' || entry.topicType !== 'regular' || entry.parentId !== sourceTopicId || !entry.cardSource)
      return []
    const cardId = entry.cardSource.kind === 'basic' || entry.cardSource.kind === 'list' || entry.cardSource.kind === 'set'
      ? entry.cardSource.sourceId === 'basic-definition'
        ? 'basic-card'
        : entry.cardSource.sourceId === 'list-definition'
          ? 'list-card'
          : entry.cardSource.sourceId === 'set-definition'
            ? 'set-card'
            : entry.cardSource.sourceId
      : entry.cardSource.sourceId === 'cloze-group'
        ? 'cloze-card'
        : entry.cardSource.sourceId === 'second-cloze-group'
          ? 'second-cloze-card'
          : entry.cardSource.sourceId
    return [{ cardId, kind: entry.cardSource.kind, sourceId: entry.cardSource.sourceId, topicId: entry.id }]
  })
}

async function createFixture(): Promise<ChildTopicLearningFixture> {
  const database = new BetterSqliteDatabase(':memory:')
  const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
  const notes = createNoteApplicationService(storage)
  const created = await notes.createNote({ initialHeading: 'Child Topic Learning', title: 'Child Topic Learning Note' })
  const renderer = createEditorNote({ id: created.id, snapshot: created.snapshot })
  const sourceTopic = renderer.getEntries().find(entry => entry.kind === 'topic' && entry.topicType === 'regular')
  if (!sourceTopic || sourceTopic.kind !== 'topic' || sourceTopic.topicType !== 'regular')
    throw new Error('Expected a regular source Topic')
  const initialBlock = firstBlock(editableDocument(renderer, sourceTopic.id))
  const initialBlockId = initialBlock.attrs?.blockId
  if (typeof initialBlockId !== 'string')
    throw new Error('Expected the initial source Block ID')

  const version = renderer.getVersion()
  renderer.applyTopicBlockEdits({ edits: sourceEdits(initialBlockId), topicId: sourceTopic.id })
  const update = renderer.exportUpdates(version)
  await notes.saveNoteUpdates({ noteId: created.id, updates: [update] })

  const fixture = {
    children: childScenarios(renderer, sourceTopic.id),
    database,
    initialBlockId,
    noteId: created.id,
    notes,
    renderer,
    sourceTopicId: sourceTopic.id,
    storage,
  }
  fixtures.push(fixture)
  return fixture
}

async function prepareToken(storage: EditorStorage, targetId: string, reviewedAt: number) {
  const prepared = await storage.learning.reviews.prepare({ reviewedAt, targetId })
  const { outcomes, ...token } = prepared
  void outcomes
  return token
}

async function rateReviewItem(
  storage: EditorStorage,
  item: DesktopReviewItem,
  rating: ReviewRating,
  reviewedAt: number,
) {
  if (item.card.kind === 'list' || item.card.kind === 'set') {
    const targets = await storage.learning.cards.listTargets(item.card.id)
    const main = targets.find(target => target.kind === 'whole')
    const items = targets.filter(target => target.kind === 'item')
    if (!main || items.length !== item.card.items.length)
      throw new Error(`Expected all targets for ${item.card.kind} Card ${item.card.id}`)
    const result = await storage.learning.reviews.rateMultiLineCard({
      cardId: item.card.id,
      itemRatings: await Promise.all(items.map(async target => ({
        ...(await prepareToken(storage, target.targetId, reviewedAt)),
        rating,
      }))),
      mainPreparation: await prepareToken(storage, main.targetId, reviewedAt),
      ...(item.card.kind === 'set' ? { setRating: rating } : {}),
    })
    return result.mainResult.state
  }

  const result = await storage.learning.reviews.rateTarget({
    ...(await prepareToken(storage, item.mainTargetId, reviewedAt)),
    rating,
  })
  return result.state
}

async function persistRendererUpdate(
  fixture: ChildTopicLearningFixture,
  version: readonly { counter: number, peer: `${number}` }[],
): Promise<void> {
  await fixture.notes.saveNoteUpdates({
    noteId: fixture.noteId,
    updates: [fixture.renderer.exportUpdates(version)],
  })
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.storage.close()))
})

describe('child Topic learning review integration', () => {
  it('queues, reviews, and rates every child Card kind while excluding the regular source Topic', async () => {
    const fixture = await createFixture()
    expect(fixture.children).toHaveLength(8)
    expect(fixture.children.map(child => child.kind).sort()).toEqual([
      'basic',
      'cloze',
      'cloze',
      'highlight',
      'highlight',
      'highlight',
      'list',
      'set',
    ])

    const reviewedAt = Date.now() + 1_000
    const reviews = createLearningReviewApplication(fixture.notes, fixture.storage.learning, () => reviewedAt)
    await expect(reviews.getNextNewItem({ noteId: fixture.noteId, now: reviewedAt, topicId: fixture.sourceTopicId })).resolves.toBeNull()

    const ratings: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']
    const phases = new Set<string>()
    for (const [index, child] of fixture.children.entries()) {
      const item = await reviews.getNextNewItem({ noteId: fixture.noteId, now: reviewedAt, topicId: child.topicId })
      if (!item)
        throw new Error(`Expected ${child.kind} child Card ${child.cardId} in the new queue`)
      expect(item).toMatchObject({
        card: { id: child.cardId, kind: child.kind },
        queue: { cardId: child.cardId, phase: 'new', topicId: child.topicId },
      })
      if (item.card.kind === 'highlight')
        expect(item.card).not.toHaveProperty('back')
      if (item.card.kind === 'cloze')
        expect(item.card.content.length).toBeGreaterThan(0)

      const state = await rateReviewItem(fixture.storage, item, ratings[index % ratings.length]!, reviewedAt + index)
      phases.add(state.phase)
      expect(state).toMatchObject({ reps: 1, targetId: item.mainTargetId })
      expect(state.dueAt).toBeGreaterThan(reviewedAt)
      expect(await fixture.storage.learning.queue.list({ now: state.dueAt, noteId: fixture.noteId, topicId: child.topicId }))
        .toContainEqual(expect.objectContaining({ cardId: child.cardId, phase: state.phase, topicId: child.topicId }))
      await expect(
        reviews.getNextItem({ noteId: fixture.noteId, now: state.dueAt, topicId: child.topicId }),
      ).resolves.toMatchObject({ card: { id: child.cardId }, queue: { topicId: child.topicId } })
      if (state.phase === 'review') {
        await expect(
          reviews.getNextReviewItem({ noteId: fixture.noteId, now: state.dueAt, topicId: child.topicId }),
        ).resolves.toMatchObject({ card: { id: child.cardId }, queue: { topicId: child.topicId } })
      }
    }
    expect(phases).toEqual(new Set(['learning', 'review']))

    expect(await fixture.storage.learning.cards.listNoteTopicIds(fixture.noteId)).toEqual(
      expect.arrayContaining(fixture.children.map(child => child.topicId)),
    )
    expect(await fixture.storage.learning.cards.listNoteTopicIds(fixture.noteId)).not.toContain(fixture.sourceTopicId)
  })

  it('keeps a detached child reviewable and creates a rateable nested grandchild', async () => {
    const fixture = await createFixture()
    const inlineChild = fixture.children.find(child => child.sourceId === 'inline-highlight')
    if (!inlineChild)
      throw new Error('Expected the inline Highlight child Topic')
    const version = fixture.renderer.getVersion()
    const document = editableDocument(fixture.renderer, inlineChild.topicId)
    const block = firstBlock(document)
    const blockId = block.attrs?.blockId
    if (typeof blockId !== 'string')
      throw new Error('Expected the Highlight child source Block ID')
    const content = ownBlockContent(block)
    if (!addMarkToFirstText(content[0]!, clozeMark('nested-cloze-card', 'nested-cloze-definition', 'nested-cloze-group')))
      throw new Error('Expected selected Highlight text in the child Topic')
    fixture.renderer.applyTopicBlockEdits({
      edits: [{ blockId, content, operation: 'update-block-content' }],
      topicId: inlineChild.topicId,
    })
    await persistRendererUpdate(fixture, version)

    const detached = fixture.renderer.getEntries().find(entry => entry.id === inlineChild.topicId)
    expect(detached).toMatchObject({ cardSource: { sourceTopicId: fixture.sourceTopicId, syncStatus: 'detached' } })
    const grandchild = fixture.renderer.getEntries().find(entry => (
      entry.kind === 'topic'
      && entry.topicType === 'regular'
      && entry.parentId === inlineChild.topicId
      && entry.cardSource?.kind === 'cloze'
      && entry.cardSource.sourceId === 'nested-cloze-group'
    ))
    if (!grandchild || grandchild.kind !== 'topic' || grandchild.topicType !== 'regular')
      throw new Error('Expected the nested Cloze grandchild Topic')
    expect(await fixture.storage.learning.cards.listNoteTopicIds(fixture.noteId)).toContain(grandchild.id)

    const reviewedAt = Date.now() + 1_000
    const reviews = createLearningReviewApplication(fixture.notes, fixture.storage.learning, () => reviewedAt)
    await expect(fixture.notes.getCardProjection({
      cardId: 'nested-cloze-card',
      noteId: fixture.noteId,
      topicId: grandchild.id,
    })).resolves.toMatchObject({ card: { id: 'nested-cloze-card', kind: 'cloze' } })
    expect(await fixture.storage.learning.queue.list({
      mode: 'new',
      noteId: fixture.noteId,
      now: reviewedAt,
      topicId: grandchild.id,
    })).toContainEqual(expect.objectContaining({ cardId: 'nested-cloze-card', topicId: grandchild.id }))
    const detachedItem = await reviews.getNextNewItem({ noteId: fixture.noteId, now: reviewedAt, topicId: inlineChild.topicId })
    expect(detachedItem).toMatchObject({ card: { id: inlineChild.cardId, kind: 'highlight' }, queue: { topicId: inlineChild.topicId } })
    if (!detachedItem)
      throw new Error('Expected the detached Highlight child in the new queue')
    await rateReviewItem(fixture.storage, detachedItem, 'good', reviewedAt)

    await expect(
      reviews.getNextNewItem({ noteId: fixture.noteId, now: reviewedAt, topicId: grandchild.id }),
    ).resolves.toBeNull()
    const nestedReviewedAt = reviewedAt + 2 * 86_400_000
    const nestedItem = await reviews.getNextNewItem({
      noteId: fixture.noteId,
      now: nestedReviewedAt,
      topicId: grandchild.id,
    })
    expect(nestedItem).toMatchObject({ card: { id: 'nested-cloze-card', kind: 'cloze' }, queue: { topicId: grandchild.id } })
    if (!nestedItem)
      throw new Error('Expected the nested Cloze grandchild in the new queue')
    const nestedState = await rateReviewItem(fixture.storage, nestedItem, 'easy', nestedReviewedAt)
    await expect(
      reviews.getNextReviewItem({ noteId: fixture.noteId, now: nestedState.dueAt, topicId: grandchild.id }),
    ).resolves.toMatchObject({ card: { id: 'nested-cloze-card', kind: 'cloze' }, queue: { topicId: grandchild.id } })
  })

  it('retains a child Card after its source definition is deleted and allows it to be rated', async () => {
    const fixture = await createFixture()
    const basicChild = fixture.children.find(child => child.sourceId === 'basic-definition')
    if (!basicChild)
      throw new Error('Expected the Basic child Topic')
    const version = fixture.renderer.getVersion()
    fixture.renderer.applyTopicBlockEdits({
      edits: [{ blockId: fixture.initialBlockId, operation: 'delete-block', strategy: 'delete-subtree' }],
      topicId: fixture.sourceTopicId,
    })
    await persistRendererUpdate(fixture, version)

    expect(fixture.renderer.getEntries().find(entry => entry.id === basicChild.topicId)).toMatchObject({
      cardSource: { sourceTopicId: fixture.sourceTopicId, syncStatus: 'detached' },
    })
    const reviewedAt = Date.now() + 1_000
    const reviews = createLearningReviewApplication(fixture.notes, fixture.storage.learning, () => reviewedAt)
    const item = await reviews.getNextNewItem({ noteId: fixture.noteId, now: reviewedAt, topicId: basicChild.topicId })
    expect(item).toMatchObject({ card: { id: 'basic-card', kind: 'basic' }, queue: { topicId: basicChild.topicId } })
    if (!item)
      throw new Error('Expected the detached Basic child in the new queue')
    const state = await rateReviewItem(fixture.storage, item, 'hard', reviewedAt)
    expect(state).toMatchObject({ reps: 1, targetId: item.mainTargetId })
  })
})
