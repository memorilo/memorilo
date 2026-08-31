import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../../../', import.meta.url)
const specification = JSON.parse(await readFile(new URL('packages/sync/schema/server-schema.json', root), 'utf8'))

function quote(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
}

function columnExpression(column, dialect) {
  let expression
  if (column.type === 'integer') {
    expression = dialect === 'postgres'
      ? `bigint(${quote(column.name)}, { mode: 'number' })`
      : `integer(${quote(column.name)})`
  }
  else if (column.type === 'json') {
    expression = dialect === 'sqlite' ? `text(${quote(column.name)}, { mode: 'json' })` : `jsonb(${quote(column.name)})`
  }
  else if (column.type === 'enum') {
    expression = `text(${quote(column.name)}, { enum: [${column.values.map(quote).join(', ')}] })`
  }
  else {
    expression = `text(${quote(column.name)})`
  }
  if (column.tsType)
    expression += `.$type<${column.tsType}>()`
  if (column.primaryKey)
    expression += '.primaryKey()'
  if (column.notNull)
    expression += '.notNull()'
  if (column.default !== undefined)
    expression += `.default(${JSON.stringify(column.default)})`
  if (column.unique)
    expression += '.unique()'
  return expression
}

function checkExpression(checkName) {
  if (checkName === 'namespace-kind') {
    return `validNamespaceAndKind: check('sync_changes_namespace_kind', sql\`(
    (\${table.namespace} = 'notes' AND \${table.kind} = 'note-update') OR
    (\${table.namespace} = 'learning' AND \${table.kind} = 'learning-mutation')
  )\`)`
  }
  if (checkName === 'positive-sequence')
    return 'positiveSequence: check(\'sync_changes_positive_sequence\', sql`' + '$' + '{table.sequence} > 0`)'
  if (checkName === 'asset-positive-sequence')
    return 'positiveSequence: check(\'sync_asset_manifests_positive_sequence\', sql`' + '$' + '{table.sequence} > 0`)'
  if (checkName === 'learning-positive-sequence')
    return 'positiveSequence: check(\'sync_learning_entities_positive_sequence\', sql`' + '$' + '{table.sourceSequence} > 0`)'
  if (checkName === 'non-negative-content-length')
    return 'nonNegativeLength: check(\'sync_objects_non_negative_length\', sql`' + '$' + '{table.contentLength} >= 0`)'
  if (checkName === 'asset-manifest-shape') {
    return `validAssetManifestShape: check('sync_asset_manifests_shape', sql\`(
    (\${table.operation} = 'delete' AND \${table.contentHash} IS NULL AND \${table.contentLength} IS NULL AND \${table.contentType} IS NULL) OR
    (\${table.operation} = 'put' AND \${table.contentHash} IS NOT NULL AND \${table.contentLength} IS NOT NULL AND \${table.contentLength} >= 0)
  )\`)`
  }
  throw new Error(`Unsupported canonical check: ${checkName}`)
}

function propertyName(name) {
  return name.replace(/^sync_/u, '').replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase())
}

function generate(dialect) {
  const tableFactory = dialect === 'sqlite' ? 'sqliteTable' : 'pgTable'
  const imports = dialect === 'sqlite'
    ? 'import { check, index, integer, sqliteTable, text, uniqueIndex } from \'drizzle-orm/sqlite-core\''
    : 'import { bigint, check, index, jsonb, pgTable, text, uniqueIndex } from \'drizzle-orm/pg-core\''
  const tables = specification.tables.map((table) => {
    const columns = table.columns.map(column => `  ${column.property}: ${columnExpression(column, dialect)},`).join('\n')
    const indexes = (table.indexes ?? []).map((indexDefinition) => {
      const factory = indexDefinition.unique ? 'uniqueIndex' : 'index'
      return `${propertyName(indexDefinition.name)}: ${factory}(${quote(indexDefinition.name)}).on(${indexDefinition.columns.map(column => `table.${column}`).join(', ')})`
    })
    const checks = (table.checks ?? []).map(checkExpression)
    const extras = [...indexes, ...checks]
    const callback = extras.length === 0
      ? ''
      : `, table => ({\n  ${extras.join(',\n  ')},\n})`
    return `export const ${table.exportName} = ${tableFactory}(${quote(table.name)}, {\n${columns}\n}${callback})`
  }).join('\n\n')
  return `// Generated from packages/sync/schema/server-schema.json. Do not edit directly.\nimport { sql } from 'drizzle-orm'\n${imports}\n\n${tables}\n`
}

await Promise.all([
  writeFile(new URL('apps/sync-server/infrastructure/database/schema.ts', root), generate('sqlite')),
  writeFile(new URL('apps/sync-server/infrastructure/database/schema.postgres.ts', root), generate('postgres')),
])
