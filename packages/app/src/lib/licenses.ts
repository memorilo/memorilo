import { z } from 'zod'

const thirdPartyLicenseManifestEntrySchema = z.object({
  id: z.string(),
  license: z.string(),
  name: z.string(),
  textId: z.string(),
  version: z.string(),
})

const thirdPartyLicenseManifestSchema = z.object({
  entries: z.array(thirdPartyLicenseManifestEntrySchema),
  generatedAt: z.string(),
  packageCount: z.number().int().nonnegative(),
  textCount: z.number().int().nonnegative(),
})

const thirdPartyLicenseTextsSchema = z.object({
  generatedAt: z.string(),
  texts: z.record(z.string(), z.string()),
})

export type ThirdPartyLicenseManifest = z.infer<typeof thirdPartyLicenseManifestSchema>
export type ThirdPartyLicenseManifestEntry = z.infer<typeof thirdPartyLicenseManifestEntrySchema>
export type ThirdPartyLicenseTexts = z.infer<typeof thirdPartyLicenseTextsSchema>

let licenseManifestPromise: Promise<ThirdPartyLicenseManifest> | null = null
let licenseTextsPromise: Promise<ThirdPartyLicenseTexts> | null = null

async function importLicenseAsset<T>(assetPath: string, schema: z.ZodType<T>) {
  try {
    const module = await import(/* @vite-ignore */ assetPath)
    return schema.parse(module.default)
  }
  catch (error) {
    if (import.meta.env.DEV) {
      throw new Error('Third-party license assets are generated during production builds and are not available in this development session.')
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load ${assetPath}: ${errorMessage}`)
  }
}

export function loadThirdPartyLicenseManifest() {
  licenseManifestPromise ??= importLicenseAsset('/meta/licenses.manifest.js', thirdPartyLicenseManifestSchema)

  return licenseManifestPromise
}

export function loadThirdPartyLicenseTexts() {
  licenseTextsPromise ??= importLicenseAsset('/meta/license-texts.js', thirdPartyLicenseTextsSchema)

  return licenseTextsPromise
}
