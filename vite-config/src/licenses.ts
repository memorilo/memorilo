import type { LicenseMeta } from 'rollup-license-plugin'
import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createViteLicensePlugin } from 'rollup-license-plugin'
import * as spdxLicenseTexts from 'spdx-license-list/full.js'

interface ThirdPartyLicenseManifestEntry {
  id: string
  license: string
  name: string
  textId: string
  version: string
}

interface ThirdPartyLicenseManifestAsset {
  entries: ThirdPartyLicenseManifestEntry[]
  generatedAt: string
  packageCount: number
  textCount: number
}

interface ThirdPartyLicenseTextsAsset {
  generatedAt: string
  texts: Record<string, string>
}

interface CompactLicenseAssets {
  manifest: ThirdPartyLicenseManifestAsset
  texts: ThirdPartyLicenseTextsAsset
}

type SpdxLicenseCatalog = Record<string, {
  licenseText: string
}>

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
const pnpmStoreMarker = `${sep}node_modules${sep}.pnpm${sep}`
const spdxLicenseCatalog: SpdxLicenseCatalog = 'default' in spdxLicenseTexts
  ? spdxLicenseTexts.default as unknown as SpdxLicenseCatalog
  : spdxLicenseTexts as unknown as SpdxLicenseCatalog

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

function getPnpmFallbackPath(targetPath: string) {
  const markerIndex = targetPath.lastIndexOf(pnpmStoreMarker)
  if (markerIndex === -1) {
    return null
  }

  const suffix = targetPath.slice(markerIndex + pnpmStoreMarker.length)
  return join(workspaceRoot, 'node_modules', '.pnpm', suffix)
}

async function resolveDependencyDir(moduleDir: string) {
  const packageJsonPath = join(moduleDir, 'package.json')
  if (await pathExists(packageJsonPath)) {
    return moduleDir
  }

  const fallbackPath = getPnpmFallbackPath(moduleDir)
  if (fallbackPath === null) {
    return moduleDir
  }

  if (await pathExists(join(fallbackPath, 'package.json'))) {
    return fallbackPath
  }

  return moduleDir
}

async function resolveDependencyFile(filePath: string) {
  if (await pathExists(filePath)) {
    return filePath
  }

  const fallbackPath = getPnpmFallbackPath(filePath)
  if (fallbackPath === null) {
    return filePath
  }

  if (await pathExists(fallbackPath)) {
    return fallbackPath
  }

  return filePath
}

function createTextId(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function normalizeLicenseText(pkg: LicenseMeta) {
  if (typeof pkg.licenseText === 'string' && pkg.licenseText.trim().length > 0) {
    return pkg.licenseText.trim().replaceAll('\r\n', '\n')
  }

  const spdxLicenseText = spdxLicenseCatalog[pkg.license]?.licenseText
  if (typeof spdxLicenseText === 'string' && spdxLicenseText.trim().length > 0) {
    return spdxLicenseText.trim().replaceAll('\r\n', '\n')
  }

  throw new Error(`Missing license text for ${pkg.name}@${pkg.version}`)
}

function buildCompactLicenseAssets(packages: LicenseMeta[]): CompactLicenseAssets {
  const generatedAt = new Date().toISOString()
  const textById = new Map<string, string>()
  const textIdByNormalizedText = new Map<string, string>()
  const entries: ThirdPartyLicenseManifestEntry[] = []

  for (const pkg of [...packages].sort((left, right) => {
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name)
    }

    return left.version.localeCompare(right.version)
  })) {
    const normalizedText = normalizeLicenseText(pkg)
    const existingTextId = textIdByNormalizedText.get(normalizedText)
    const textId = existingTextId ?? createTextId(normalizedText)

    if (existingTextId === undefined) {
      textIdByNormalizedText.set(normalizedText, textId)
      textById.set(textId, normalizedText)
    }

    entries.push({
      id: `${pkg.name}@${pkg.version}`,
      license: pkg.license,
      name: pkg.name,
      textId,
      version: pkg.version,
    })
  }

  return {
    manifest: {
      entries,
      generatedAt,
      packageCount: entries.length,
      textCount: textById.size,
    },
    texts: {
      generatedAt,
      texts: Object.fromEntries(
        [...textById.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
  }
}

function serializeLicenseManifest(packages: LicenseMeta[]) {
  return `export default ${JSON.stringify(buildCompactLicenseAssets(packages).manifest, null, 2)}\n`
}

function serializeLicenseTexts(packages: LicenseMeta[]) {
  return `export default ${JSON.stringify(buildCompactLicenseAssets(packages).texts, null, 2)}\n`
}

export function spdxLicensePlugin() {
  return createViteLicensePlugin({
    __mocks__: {
      getLicenseFileName: async (moduleDir) => {
        const resolvedModuleDir = await resolveDependencyDir(moduleDir)
        return (await readdir(resolvedModuleDir, { withFileTypes: true }))
          .filter(dirent => !dirent.isDirectory())
          .map(dirent => dirent.name)
          .find(name => /^licen[cs]e/i.test(name))
      },
      readLicenseFileContents: async (path) => {
        const resolvedPath = await resolveDependencyFile(path)
        return readFile(resolvedPath, 'utf-8')
      },
      readPackageMeta: async (moduleDir, readPackageMeta) => {
        const resolvedModuleDir = await resolveDependencyDir(moduleDir)
        return readPackageMeta(resolvedModuleDir)
      },
    },
    excludedPackageTest: packageName => packageName.startsWith('@memorilo/'),
    outputFilename: false,
    additionalFiles: {
      'meta/licenses.manifest.js': serializeLicenseManifest,
      'meta/license-texts.js': serializeLicenseTexts,
    },
  })
}
