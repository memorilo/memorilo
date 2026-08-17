import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configuration = JSON.parse(await readFile(resolve(repositoryRoot, 'config/embedding-model.json'), 'utf8'))

if (configuration.dtype !== 'q8')
  throw new TypeError(`Unsupported mobile embedding model dtype: ${configuration.dtype}`)
if (!Number.isInteger(configuration.dimensions) || configuration.dimensions < 1)
  throw new RangeError('Mobile embedding model dimensions must be a positive integer')
for (const property of ['id', 'revision']) {
  if (typeof configuration[property] !== 'string' || configuration[property].length === 0)
    throw new TypeError(`Mobile embedding model ${property} must be a non-empty string`)
}

const sourceDirectory = resolve(
  repositoryRoot,
  '.cache/embedding-models',
  configuration.id,
  configuration.revision,
)
const sourceModel = resolve(sourceDirectory, 'onnx/model_quantized.onnx')
const sourceTokenizer = resolve(sourceDirectory, 'tokenizer.json')
const targetDirectory = resolve(repositoryRoot, 'apps/mobile/.generated/embedding-model')

await mkdir(targetDirectory, { recursive: true })
await Promise.all([
  cp(sourceModel, resolve(targetDirectory, 'model_quantized.onnx')),
  cp(sourceTokenizer, resolve(targetDirectory, 'tokenizer.bin')),
])

await rm(resolve(targetDirectory, 'model_quantized.onnx.tmp'), { force: true })
process.stdout.write(`Mobile embedding model ${configuration.id}@${configuration.revision} is ready in ${targetDirectory}\n`)
