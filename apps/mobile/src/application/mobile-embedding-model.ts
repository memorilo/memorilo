import type { Encoding } from '@huggingface/tokenizers'
import type { EmbeddingModel } from '@memorilo/editor-storage'
import { Tokenizer } from '@huggingface/tokenizers'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import { InferenceSession, Tensor } from 'onnxruntime-react-native'
import modelConfiguration from '../../../../config/embedding-model.json'

// Metro resolves these generated binary modules into native asset IDs.
// eslint-disable-next-line ts/no-require-imports
const modelAsset = require('../../.generated/embedding-model/model_quantized.onnx') as number
// eslint-disable-next-line ts/no-require-imports
const tokenizerAsset = require('../../.generated/embedding-model/tokenizer.bin') as number

const modelMaxLength = 512

interface TokenizerState {
  padTokenId: number
  tokenizer: Tokenizer
}

interface BatchEncoding {
  attentionMask: Int32Array
  inputIds: BigInt64Array
  sequenceLength: number
  tokenTypeIds: BigInt64Array
}

function assertAssetUri(asset: Asset, name: string): string {
  if (asset.localUri === null)
    throw new Error(`Mobile embedding ${name} asset was not downloaded`)
  return asset.localUri
}

function normalize(vector: Float32Array): Float32Array {
  let squaredNorm = 0
  for (const value of vector)
    squaredNorm += value * value
  if (squaredNorm === 0)
    throw new Error('Mobile embedding model returned a zero vector')
  const scale = 1 / Math.sqrt(squaredNorm)
  for (let index = 0; index < vector.length; index++)
    vector[index] = (vector[index] ?? 0) * scale
  return vector
}

function encodeText(tokenizer: Tokenizer, text: string): Encoding {
  const encoding = tokenizer.encode(text, { add_special_tokens: true })
  if (encoding.ids.length <= modelMaxLength)
    return encoding
  return tokenizer.encode(text.slice(0, Math.max(1, text.length - 1)), { add_special_tokens: true })
}

function createBatch(tokenizerState: TokenizerState, texts: readonly string[]): BatchEncoding {
  const encodings = texts.map(text => encodeText(tokenizerState.tokenizer, text))
  const sequenceLength = Math.min(
    modelMaxLength,
    Math.max(...encodings.map(encoding => encoding.ids.length)),
  )
  const inputIds = new BigInt64Array(texts.length * sequenceLength)
  const tokenTypeIds = new BigInt64Array(texts.length * sequenceLength)
  const attentionMask = new Int32Array(texts.length * sequenceLength)

  encodings.forEach((encoding, row) => {
    const offset = row * sequenceLength
    const length = Math.min(sequenceLength, encoding.ids.length)
    for (let column = 0; column < length; column++) {
      inputIds[offset + column] = BigInt(encoding.ids[column] ?? tokenizerState.padTokenId)
      attentionMask[offset + column] = 1
    }
    for (let column = length; column < sequenceLength; column++)
      inputIds[offset + column] = BigInt(tokenizerState.padTokenId)
  })

  return { attentionMask, inputIds, sequenceLength, tokenTypeIds }
}

export class MobileEmbeddingModel implements EmbeddingModel {
  readonly dimensions = modelConfiguration.dimensions
  readonly id = modelConfiguration.id
  #resources: Promise<{ session: InferenceSession, tokenizer: TokenizerState }> | null = null

  async embedDocuments(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0)
      return []
    return this.#embed(texts.map(text => `passage: ${text}`))
  }

  async embedQuery(text: string): Promise<Float32Array> {
    if (text.length === 0)
      throw new TypeError('Embedding query must be a non-empty string')
    const [vector] = await this.#embed([`query: ${text}`])
    if (!vector)
      throw new Error(`Embedding model ${this.id} did not return a query vector`)
    return vector
  }

  async close(): Promise<void> {
    const resources = this.#resources
    this.#resources = null
    if (!resources)
      return
    const { session } = await resources
    session.release()
  }

  async #embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    const { session, tokenizer } = await this.#getResources()
    const batch = createBatch(tokenizer, texts)
    const result = await session.run({
      attention_mask: new Tensor('int32', batch.attentionMask, [texts.length, batch.sequenceLength]),
      input_ids: new Tensor('int64', batch.inputIds, [texts.length, batch.sequenceLength]),
      token_type_ids: new Tensor('int64', batch.tokenTypeIds, [texts.length, batch.sequenceLength]),
    })
    const output = result.last_hidden_state
    if (!output || output.type !== 'float32' || output.dims.length !== 3)
      throw new Error(`Embedding model ${this.id} returned an incompatible output tensor`)
    const values = output.data as Float32Array
    const vectors = texts.map((_, row) => {
      const vector = new Float32Array(this.dimensions)
      const offset = row * batch.sequenceLength * this.dimensions
      let count = 0
      for (let column = 0; column < batch.sequenceLength; column++) {
        if (batch.attentionMask[row * batch.sequenceLength + column] !== 1)
          continue
        count++
        const tokenOffset = offset + column * this.dimensions
        for (let dimension = 0; dimension < this.dimensions; dimension++)
          vector[dimension] = (vector[dimension] ?? 0) + (values[tokenOffset + dimension] ?? 0)
      }
      if (count === 0)
        throw new Error('Embedding model received an empty token sequence')
      for (let dimension = 0; dimension < this.dimensions; dimension++)
        vector[dimension] = (vector[dimension] ?? 0) / count
      return normalize(vector)
    })
    output.dispose()
    return vectors
  }

  #getResources(): Promise<{ session: InferenceSession, tokenizer: TokenizerState }> {
    if (this.#resources)
      return this.#resources
    this.#resources = (async () => {
      const [model, tokenizerFile] = await Promise.all([
        Asset.loadAsync(modelAsset).then(([asset]) => asset),
        Asset.loadAsync(tokenizerAsset).then(([asset]) => asset),
      ])
      if (!model || !tokenizerFile)
        throw new Error('Mobile embedding assets did not load')
      const tokenizerJson = JSON.parse(await new File(assertAssetUri(tokenizerFile, 'tokenizer')).text()) as object
      const tokenizer = new Tokenizer(tokenizerJson, {
        add_prefix_space: true,
        clean_up_tokenization_spaces: true,
        model_max_length: modelMaxLength,
      })
      const padTokenId = tokenizer.token_to_id('<pad>')
      if (padTokenId === undefined)
        throw new Error('Mobile embedding tokenizer does not define <pad>')
      const session = await InferenceSession.create(assertAssetUri(model, 'model'), {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 2,
      })
      return { session, tokenizer: { padTokenId, tokenizer } }
    })()
    void this.#resources.catch(() => {
      this.#resources = null
    })
    return this.#resources
  }
}
