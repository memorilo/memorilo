const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)

function sassLoadDirectories(root) {
  const directories = []
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    if (entries.some(entry => entry.isFile() && entry.name.endsWith('.scss')))
      directories.push(directory)
    entries.forEach((entry) => {
      if (entry.isDirectory())
        visit(path.join(directory, entry.name))
    })
  }
  visit(root)
  return directories
}

const excalidrawRoot = path.resolve(workspaceRoot, 'packages/excalidraw')
const mobileI18nextEntry = require.resolve('i18next', { paths: [projectRoot] })
const mobileReactI18nextEntry = require.resolve('react-i18next', { paths: [projectRoot] })
const expoRoot = path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] }))
// Expo's winter URL polyfill and the FSRS package both expose ESM entries.
// Pin the executable CommonJS entries so Metro's native and DOM graphs share
// the same runtime implementation while explicit `?url` imports remain assets.
const whatwgUrlMinimumEntry = require.resolve('whatwg-url-minimum', { paths: [expoRoot] })
const tsFsrsEntry = require.resolve('ts-fsrs', { paths: [path.resolve(workspaceRoot, 'packages/srs')] })
process.env.SASS_PATH = [
  ...(process.env.SASS_PATH ? process.env.SASS_PATH.split(path.delimiter) : []),
  ...sassLoadDirectories(excalidrawRoot),
  path.join(excalidrawRoot, 'node_modules'),
].join(path.delimiter)

config.watchFolders = [workspaceRoot]
config.transformerPath = path.resolve(projectRoot, 'metro-transformer.cjs')
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs']
config.resolver.assetExts = config.resolver.assetExts
  .filter(extension => extension !== 'mjs')
  .concat('onnx', 'bin', 'wasm', 'woff', 'woff2')
const portableSrsEntry = path.resolve(workspaceRoot, 'packages/srs/src/portable.ts')
const browserSrsEntry = path.resolve(workspaceRoot, 'packages/srs/src/browser.ts')
const optimizerWasmEntry = require.resolve(
  '@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm',
  { paths: [projectRoot] },
)
const optimizerWorkerEntry = require.resolve(
  '@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs',
  { paths: [projectRoot] },
)
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'i18next')
    return { filePath: mobileI18nextEntry, type: 'sourceFile' }
  if (moduleName === 'react-i18next')
    return { filePath: mobileReactI18nextEntry, type: 'sourceFile' }
  if (moduleName === 'whatwg-url-minimum')
    return { filePath: whatwgUrlMinimumEntry, type: 'sourceFile' }
  if (moduleName === 'ts-fsrs')
    return { filePath: tsFsrsEntry, type: 'sourceFile' }
  if (moduleName === '@memorilo/srs') {
    return { filePath: platform === 'web' ? browserSrsEntry : portableSrsEntry, type: 'sourceFile' }
  }
  if (moduleName === '@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm?url')
    return { filePaths: [optimizerWasmEntry], type: 'assetFiles' }
  if (moduleName === '@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs?url')
    return { filePaths: [optimizerWorkerEntry], type: 'assetFiles' }
  // Expo DOM surfaces need the browser-compatible WASM entry, while Hermes
  // has no WebAssembly runtime and must use Loro's React Native binding.
  if (moduleName === 'loro-crdt') {
    return defaultResolveRequest
      ? defaultResolveRequest(context, platform === 'web' ? 'loro-crdt/base64' : 'loro-react-native', platform)
      : context.resolveRequest(context, platform === 'web' ? 'loro-crdt/base64' : 'loro-react-native', platform)
  }
  const resolvedModuleName = moduleName.endsWith('?url')
    ? moduleName.slice(0, -'?url'.length)
    : moduleName
  return defaultResolveRequest
    ? defaultResolveRequest(context, resolvedModuleName, platform)
    : context.resolveRequest(context, resolvedModuleName, platform)
}

module.exports = config
