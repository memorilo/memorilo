const { createRequire } = require('node:module')

const requireFromExpo = createRequire(require.resolve('expo/metro-config'))
const expoTransformer = requireFromExpo('@expo/metro-config/build/transform-worker/transform-worker')
const { transform: transformCss } = requireFromExpo('lightningcss')

const bundledFontStylesheets = [
  /\/katex\/dist\/katex(?:\.min)?\.css$/,
  /\/packages\/excalidraw\/fonts\/fonts\.css$/,
]

function usesMobileFontPipeline(filename, options) {
  return typeof options.customTransformOptions?.dom === 'string'
    && bundledFontStylesheets.some(pattern => pattern.test(filename))
}

function removeBundledFontFaces(filename, data) {
  return transformCss({
    code: data,
    filename,
    visitor: {
      Rule: {
        'font-face': () => [],
      },
    },
  }).code
}

async function transform(config, projectRoot, filename, data, options) {
  const source = usesMobileFontPipeline(filename, options)
    ? removeBundledFontFaces(filename, data)
    : data
  return expoTransformer.transform(config, projectRoot, filename, source, options)
}

module.exports = {
  ...expoTransformer,
  transform,
}
