import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { env, pipeline } from '@huggingface/transformers'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configurationPath = resolve(repositoryRoot, 'config/embedding-model.json')
const cacheDirectory = resolve(repositoryRoot, '.cache/embedding-models')
const configuration = JSON.parse(await readFile(configurationPath, 'utf8'))

if (configuration.dtype !== 'q8')
  throw new TypeError(`Unsupported embedding model dtype: ${configuration.dtype}`)
if (!Number.isInteger(configuration.dimensions) || configuration.dimensions < 1)
  throw new RangeError('Embedding model dimensions must be a positive integer')
for (const property of ['id', 'revision']) {
  if (typeof configuration[property] !== 'string' || configuration[property].length === 0)
    throw new TypeError(`Embedding model ${property} must be a non-empty string`)
}

await mkdir(cacheDirectory, { recursive: true })
env.allowLocalModels = true
env.allowRemoteModels = true
env.cacheDir = cacheDirectory

const extractor = await pipeline('feature-extraction', configuration.id, {
  dtype: configuration.dtype,
  revision: configuration.revision,
})
const probe = await extractor('passage: embedding model preparation probe', {
  normalize: true,
  pooling: 'mean',
})
const dimensions = probe.dims.at(-1)
if (dimensions !== configuration.dimensions)
  throw new RangeError(`Embedding model returned ${dimensions} dimensions; expected ${configuration.dimensions}`)
await extractor.dispose()

process.stdout.write(`Embedding model ${configuration.id}@${configuration.revision} is ready in ${cacheDirectory}\n`)
