import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import modelConfiguration from '../../../../../config/embedding-model.json'
import { TransformersEmbeddingModel } from './transformers-embedding-model'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const modelCacheDirectory = resolve(repositoryRoot, '.cache/embedding-models')

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length)
    throw new RangeError(`Cannot compare vectors with ${left.length} and ${right.length} dimensions`)
  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (const [index, leftValue] of left.entries()) {
    const rightValue = right[index]
    if (rightValue === undefined)
      throw new Error(`Right vector omitted dimension ${index}`)
    dotProduct += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }
  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude)
}

describe('transformers embedding model', () => {
  it('loads the prepared model offline and embeds multilingual text', async () => {
    const model = new TransformersEmbeddingModel({
      allowRemoteModels: false,
      cacheDirectory: modelCacheDirectory,
    })

    const query = await model.embedQuery('如何设计数据库索引')
    const documents = await model.embedDocuments([
      '数据库索引可以提升查询速度',
      '红熊猫生活在高山森林中',
    ])
    const relevant = documents[0]
    const unrelated = documents[1]
    if (!relevant || !unrelated)
      throw new Error('Embedding model did not return both document vectors')

    expect(model.id).toBe(modelConfiguration.id)
    expect(query).toHaveLength(modelConfiguration.dimensions)
    expect([...query].every(Number.isFinite)).toBe(true)
    expect(cosineSimilarity(query, query)).toBeCloseTo(1, 5)
    expect(cosineSimilarity(query, relevant)).toBeGreaterThan(cosineSimilarity(query, unrelated))
  }, 60_000)
})
