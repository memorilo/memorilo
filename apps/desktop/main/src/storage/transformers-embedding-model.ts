import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbeddingModel } from '@memorilo/editor-storage'
import { env, pipeline } from '@huggingface/transformers'
import modelConfiguration from '../../../../../config/embedding-model.json'

function readModelDtype(): 'q8' {
  if (modelConfiguration.dtype !== 'q8')
    throw new TypeError(`Unsupported embedding model dtype: ${modelConfiguration.dtype}`)
  return modelConfiguration.dtype
}

const modelDtype = readModelDtype()

export interface TransformersEmbeddingModelOptions {
  allowRemoteModels: boolean
  cacheDirectory: string
}

export class TransformersEmbeddingModel implements EmbeddingModel {
  readonly dimensions = modelConfiguration.dimensions
  readonly id = modelConfiguration.id
  readonly #allowRemoteModels: boolean
  readonly #cacheDirectory: string
  #extractor: Promise<FeatureExtractionPipeline> | null = null

  constructor(options: TransformersEmbeddingModelOptions) {
    if (options.cacheDirectory.length === 0)
      throw new TypeError('Embedding model cache directory must be a non-empty string')
    this.#allowRemoteModels = options.allowRemoteModels
    this.#cacheDirectory = options.cacheDirectory
  }

  async embedDocuments(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0)
      return []
    return this.#embed(texts.map(text => `passage: ${text}`))
  }

  async embedQuery(text: string): Promise<Float32Array> {
    if (text.length === 0)
      throw new TypeError('Embedding query must be a non-empty string')
    const vectors = await this.#embed([`query: ${text}`])
    const vector = vectors[0]
    if (!vector)
      throw new Error(`Embedding model ${this.id} did not return a query vector`)
    return vector
  }

  async #embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    const extractor = await this.#getExtractor()
    const tensor = await extractor([...texts], { normalize: true, pooling: 'mean' })
    const values = tensor.tolist() as number[][]
    return values.map(vector => Float32Array.from(vector))
  }

  #getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.#extractor)
      return this.#extractor
    env.cacheDir = this.#cacheDirectory
    env.allowLocalModels = true
    env.allowRemoteModels = this.#allowRemoteModels
    const extractor = pipeline('feature-extraction', this.id, {
      dtype: modelDtype,
      revision: modelConfiguration.revision,
    })
    this.#extractor = extractor
    void extractor.catch(() => {
      if (this.#extractor === extractor)
        this.#extractor = null
    })
    return extractor
  }
}
