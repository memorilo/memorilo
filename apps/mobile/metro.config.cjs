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
process.env.SASS_PATH = [
  ...(process.env.SASS_PATH ? process.env.SASS_PATH.split(path.delimiter) : []),
  ...sassLoadDirectories(excalidrawRoot),
  path.join(excalidrawRoot, 'node_modules'),
].join(path.delimiter)

config.watchFolders = [workspaceRoot]
config.transformerPath = path.resolve(projectRoot, 'metro-transformer.cjs')
config.resolver.assetExts = [...config.resolver.assetExts, 'onnx', 'bin', 'wasm', 'woff', 'woff2']
const portableSrsEntry = path.resolve(workspaceRoot, 'packages/srs/src/portable.ts')
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@memorilo/srs') {
    return { filePath: portableSrsEntry, type: 'sourceFile' }
  }
  // Expo DOM runs in a browser WebView. The default Loro bundler entry loads
  // a sibling .wasm URL, which Metro serves as the development HTML shell.
  // The base64 entry keeps the exact same API while embedding the WASM bytes.
  if (moduleName === 'loro-crdt' && platform === 'web') {
    return defaultResolveRequest
      ? defaultResolveRequest(context, 'loro-crdt/base64', platform)
      : context.resolveRequest(context, 'loro-crdt/base64', platform)
  }
  const resolvedModuleName = moduleName.endsWith('.wasm?url')
    ? moduleName.slice(0, -'?url'.length)
    : moduleName
  return defaultResolveRequest
    ? defaultResolveRequest(context, resolvedModuleName, platform)
    : context.resolveRequest(context, resolvedModuleName, platform)
}

module.exports = config
