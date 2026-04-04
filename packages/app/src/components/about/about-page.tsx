import type {
  ThirdPartyLicenseManifest,
  ThirdPartyLicenseManifestEntry,
  ThirdPartyLicenseTexts,
} from '~/lib/licenses'
import { runPromise } from '@memorilo/api-spec'
import { OpenerService } from '@memorilo/api-spec/services/opener'
import { Effect } from 'effect'
import { startTransition, useEffect, useState } from 'react'
import { useAboutInfo } from '~/hooks/api'
import {
  loadThirdPartyLicenseManifest,
  loadThirdPartyLicenseTexts,
} from '~/lib/licenses'
import {
  AboutHeroSection,
  ContributorsSection,
  ThirdPartyLicensesSection,
} from './about-sections'

export function AboutPage() {
  const aboutInfoQuery = useAboutInfo()
  const [licenseManifestState, setLicenseManifestState] = useState<{
    data: ThirdPartyLicenseManifest | null
    error: string | null
    status: 'error' | 'loading' | 'success'
  }>({
    data: null,
    error: null,
    status: 'loading',
  })
  const [licenseTextsState, setLicenseTextsState] = useState<{
    data: ThirdPartyLicenseTexts | null
    error: string | null
    status: 'error' | 'idle' | 'loading' | 'success'
  }>({
    data: null,
    error: null,
    status: 'idle',
  })
  const [expandedLicenseId, setExpandedLicenseId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    loadThirdPartyLicenseManifest()
      .then((data) => {
        if (!active) {
          return
        }

        setLicenseManifestState({
          data,
          error: null,
          status: 'success',
        })
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }

        setLicenseManifestState({
          data: null,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
        })
      })

    return () => {
      active = false
    }
  }, [])

  const aboutInfo = aboutInfoQuery.status === 'success' ? aboutInfoQuery.data : null
  const aboutInfoError = aboutInfoQuery.status === 'error'
    ? aboutInfoQuery.error instanceof Error ? aboutInfoQuery.error.message : String(aboutInfoQuery.error)
    : null

  function handleRevealDir() {
    if (aboutInfo === null || aboutInfo.appLocalDataDir.length === 0) {
      return
    }

    runPromise(Effect.gen(function* () {
      const { revealItemInDir } = yield* OpenerService
      yield* revealItemInDir(aboutInfo.appLocalDataDir)
    }))
  }

  function handleOpenContributor(url: string) {
    runPromise(Effect.gen(function* () {
      const { openUrl } = yield* OpenerService
      yield* openUrl(url)
    }))
  }

  function ensureLicenseTextsLoaded() {
    if (licenseTextsState.status === 'loading' || licenseTextsState.status === 'success') {
      return
    }

    setLicenseTextsState({
      data: null,
      error: null,
      status: 'loading',
    })

    loadThirdPartyLicenseTexts()
      .then((data) => {
        setLicenseTextsState({
          data,
          error: null,
          status: 'success',
        })
      })
      .catch((error: unknown) => {
        setLicenseTextsState({
          data: null,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
        })
      })
  }

  function handleToggleLicense(entry: ThirdPartyLicenseManifestEntry) {
    const shouldExpand = expandedLicenseId !== entry.id

    startTransition(() => {
      setExpandedLicenseId(current => current === entry.id ? null : entry.id)
    })

    if (shouldExpand) {
      ensureLicenseTextsLoaded()
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_44%),radial-gradient(circle_at_85%_18%,hsl(var(--accent)/0.16),transparent_34%)]" />
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <AboutHeroSection
          aboutInfo={aboutInfo}
          aboutInfoError={aboutInfoError}
          aboutInfoStatus={aboutInfoQuery.status}
          onRevealDir={handleRevealDir}
        />
        <ContributorsSection onOpenContributor={handleOpenContributor} />
        <ThirdPartyLicensesSection
          expandedLicenseId={expandedLicenseId}
          licenseManifest={licenseManifestState.data}
          licenseManifestError={licenseManifestState.error}
          licenseManifestStatus={licenseManifestState.status}
          licenseTexts={licenseTextsState.data}
          licenseTextsError={licenseTextsState.error}
          licenseTextsStatus={licenseTextsState.status}
          onToggleLicense={handleToggleLicense}
        />
      </div>
    </div>
  )
}
