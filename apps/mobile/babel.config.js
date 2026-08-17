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
    ]],
    presets: ['babel-preset-expo'],
  }
}
