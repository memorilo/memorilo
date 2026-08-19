const { env } = require('node:process')

module.exports = function configureBabel(api) {
  api.cache(true)
  return {
    plugins: [[
      '@stylexjs/babel-plugin',
      {
        dev: env.NODE_ENV !== 'production',
        runtimeInjection: true,
        unstable_moduleResolution: { type: 'commonJS' },
      },
    ], require.resolve('./babel-plugins/expo-dom-import-meta-env.cjs')],
    presets: [[
      'babel-preset-expo',
      {
        web: { transformImportMeta: true },
      },
    ]],
  }
}
