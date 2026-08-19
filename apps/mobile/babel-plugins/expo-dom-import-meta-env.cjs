const { env } = require('node:process')

module.exports = function expoDomImportMetaEnv({ types: t }) {
  const isImportMeta = node => (
    node?.type === 'MetaProperty'
    && node.meta.name === 'import'
    && node.property.name === 'meta'
  )

  const isImportMetaEnv = node => (
    node?.type === 'MemberExpression'
    && !node.computed
    && node.property.type === 'Identifier'
    && node.property.name === 'env'
    && isImportMeta(node.object)
  )

  return {
    name: 'memorilo-expo-dom-import-meta-env',
    visitor: {
      MemberExpression(path, state) {
        if (state.file.opts.caller?.platform !== 'web' || !isImportMetaEnv(path.node.object))
          return

        const key = path.node.computed
          ? path.node.property.value
          : path.node.property.name
        if (typeof key !== 'string')
          return

        if (key === 'DEV') {
          path.replaceWith(t.booleanLiteral(env.NODE_ENV !== 'production'))
          return
        }
        if (key === 'PROD') {
          path.replaceWith(t.booleanLiteral(env.NODE_ENV === 'production'))
          return
        }
        if (key === 'MODE') {
          path.replaceWith(t.stringLiteral(env.NODE_ENV === 'production' ? 'production' : 'development'))
          return
        }
        if (key === 'SSR') {
          path.replaceWith(t.booleanLiteral(false))
          return
        }
        path.replaceWith(t.identifier('undefined'))
      },
    },
  }
}
