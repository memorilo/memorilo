import type {
  NoteSearchHit,
  StoredTopicBlock,
  TopicBlockSearchHit,
  TopicSearchHit,
} from './editor-storage-contracts'

function blockKey(block: Pick<StoredTopicBlock, 'id' | 'noteId' | 'topicId'>): string {
  return `${block.noteId}\0${block.topicId}\0${block.id}`
}

function topicKey(hit: Pick<TopicSearchHit, 'noteId' | 'topicId'>): string {
  return `${hit.noteId}\0${hit.topicId}`
}

export function mergeNoteSearchResults(
  titles: readonly NoteSearchHit[],
  nodeStarts: readonly TopicSearchHit[],
  content: readonly TopicSearchHit[],
  semantic: readonly TopicSearchHit[],
  limit: number,
): readonly NoteSearchHit[] {
  const results: NoteSearchHit[] = []
  const seenTopics = new Set<string>()
  for (const hit of titles) {
    if (hit.kind === 'topic')
      seenTopics.add(topicKey(hit))
    results.push(hit)
  }
  for (const hits of [nodeStarts, content, semantic]) {
    for (const hit of hits) {
      const key = topicKey(hit)
      if (!seenTopics.has(key)) {
        seenTopics.add(key)
        results.push(hit)
      }
    }
  }
  return results.slice(0, limit)
}

export function fuseTopicBlockSearchResults(
  lexical: readonly TopicBlockSearchHit[],
  semantic: readonly TopicBlockSearchHit[],
  limit: number,
): readonly TopicBlockSearchHit[] {
  const candidates = new Map<string, { hit: TopicBlockSearchHit, score: number }>()
  for (const hits of [lexical, semantic]) {
    for (const [index, hit] of hits.entries()) {
      const key = blockKey(hit)
      const score = 1 / (61 + index)
      const existing = candidates.get(key)
      if (existing) {
        existing.score += score
        if (hit.preview !== hit.text)
          existing.hit = hit
      }
      else {
        candidates.set(key, { hit, score })
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(candidate => ({ ...candidate.hit, rank: -candidate.score }))
}
