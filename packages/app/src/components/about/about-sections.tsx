import type { AboutInfo } from '~/hooks/api'
import type {
  ThirdPartyLicenseManifestEntry,
  ThirdPartyLicenseTexts,
} from '~/lib/licenses'
import { Button } from '@memorilo/components/ui/button'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { cn } from '@memorilo/utils'
import { Array as EffectArray } from 'effect'
import { motion } from 'motion/react'
import {
  LuFolderOpen,
  LuGitCommitHorizontal,
  LuHardDriveDownload,
} from 'react-icons/lu'
import { contributors } from '~/lib/contributors'
import Logo from '../../../../../src-tauri/icons/icon.png'
import {
  ContributorCard,
  DetailRow,
  LicenseRow,
  SectionHeading,
  StatusNotice,
} from './about-primitives'

export function AboutHeroSection({
  aboutInfo,
  aboutInfoError,
  aboutInfoStatus,
  onRevealDir,
}: {
  aboutInfo: AboutInfo | null
  aboutInfoError: string | null
  aboutInfoStatus: 'error' | 'pending' | 'success'
  onRevealDir: () => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative overflow-hidden border-b border-border/70"
    >
      <div className="relative flex flex-col gap-4 px-6 py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            <div className="relative rounded-md bg-background/80 p-2.5">
              <div className="absolute inset-0 rounded-md bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.12),transparent_58%)]" />
              <img
                src={Logo}
                alt="Memorilo logo"
                className="relative h-16 w-auto max-w-none object-contain"
              />
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-muted-foreground">Memorilo</p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">About Memorilo</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  A local-first writing space for durable notes, fast editing, and multilingual thinking.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium">
              Version
              {' '}
              {aboutInfo !== null ? aboutInfo.version : 'Loading...'}
            </span>
            <span className="font-medium">
              Tauri
              {' '}
              {aboutInfo !== null ? aboutInfo.tauriVersion : 'Loading...'}
            </span>
            <span className="font-medium uppercase">
              {PLATFORM}
            </span>
          </div>
        </div>

        {aboutInfoError !== null && (
          <StatusNotice tone="critical">
            Failed to load runtime information:
            {' '}
            {aboutInfoError}
          </StatusNotice>
        )}

        <div className="-mx-6 overflow-hidden border-t border-border/60">
          <DetailRow
            icon={<LuHardDriveDownload className="size-3.5" />}
            label="Document nodes"
            value={aboutInfo !== null
              ? <p className="font-mono text-xs">{aboutInfo.docNodesCount.toLocaleString('en-US')}</p>
              : aboutInfoStatus === 'pending'
                ? <Skeleton className="h-4 w-20" />
                : <p className="text-muted-foreground">Unavailable</p>}
          />
          <DetailRow
            icon={<LuHardDriveDownload className="size-3.5" />}
            label="Document updates"
            value={aboutInfo !== null
              ? <p className="font-mono text-xs">{aboutInfo.docUpdatesCount.toLocaleString('en-US')}</p>
              : aboutInfoStatus === 'pending'
                ? <Skeleton className="h-4 w-20" />
                : <p className="text-muted-foreground">Unavailable</p>}
          />
          <DetailRow
            icon={<LuHardDriveDownload className="size-3.5" />}
            label="Client ID"
            value={aboutInfo !== null
              ? <p className="break-all font-mono text-xs">{aboutInfo.clientID}</p>
              : aboutInfoStatus === 'pending'
                ? <Skeleton className="h-4 w-52" />
                : <p className="text-muted-foreground">Unavailable</p>}
          />
          <DetailRow
            icon={<LuGitCommitHorizontal className="size-3.5" />}
            label="Git commit"
            value={aboutInfo !== null
              ? <p className="break-all font-mono text-xs">{aboutInfo.gitCommitId.length > 0 ? aboutInfo.gitCommitId : 'Unavailable'}</p>
              : aboutInfoStatus === 'pending'
                ? <Skeleton className="h-4 w-44" />
                : <p className="text-muted-foreground">Unavailable</p>}
          />
          <DetailRow
            icon={<LuFolderOpen className="size-3.5" />}
            label="App data directory"
            value={aboutInfo !== null
              ? <p className="break-all font-mono text-xs">{aboutInfo.appLocalDataDir}</p>
              : aboutInfoStatus === 'pending'
                ? <Skeleton className="h-4 w-full max-w-sm" />
                : <p className="text-muted-foreground">Unavailable</p>}
            action={aboutInfo !== null
              ? (
                  <Button
                    className="shrink-0"
                    variant="outline"
                    size="sm"
                    onClick={onRevealDir}
                    disabled={aboutInfo.appLocalDataDir.length === 0}
                  >
                    Reveal directory
                  </Button>
                )
              : null}
          />
        </div>
      </div>
    </motion.section>
  )
}

export function ContributorsSection({ onOpenContributor }: { onOpenContributor: (url: string) => void }) {
  const contributorRows = EffectArray.chunksOf(contributors, 2)

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.06 }}
      className="border-b border-border/70"
    >
      <div className="flex flex-col gap-4 px-6 py-10">
        <SectionHeading
          eyebrow="Contributors"
          title="People shaping the product"
        />

        <div className="-mx-6 overflow-hidden">
          {contributorRows.map(row => (
            <div
              key={row.map(contributor => contributor.username).join(':')}
              className="border-b border-border/60 px-6 last:border-b-0"
            >
              <div className="grid gap-x-12 md:grid-cols-2">
                {row.map((contributor, contributorIndex) => (
                  <div
                    key={contributor.username}
                    className={cn(
                      'py-3',
                      contributorIndex > 0 && 'border-t border-border/60 md:border-t-0',
                    )}
                  >
                    <ContributorCard
                      contributor={contributor}
                      onOpen={onOpenContributor}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

export function ThirdPartyLicensesSection({
  expandedLicenseId,
  licenseManifest,
  licenseManifestError,
  licenseManifestStatus,
  licenseTexts,
  licenseTextsError,
  licenseTextsStatus,
  onToggleLicense,
}: {
  expandedLicenseId: string | null
  licenseManifest: {
    entries: ThirdPartyLicenseManifestEntry[]
  } | null
  licenseManifestError: string | null
  licenseManifestStatus: 'error' | 'loading' | 'success'
  licenseTexts: ThirdPartyLicenseTexts | null
  licenseTextsError: string | null
  licenseTextsStatus: 'error' | 'idle' | 'loading' | 'success'
  onToggleLicense: (entry: ThirdPartyLicenseManifestEntry) => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut', delay: 0.1 }}
    >
      <div className="flex flex-col gap-4 px-6 py-10">
        <SectionHeading
          eyebrow="Third-party licenses"
          title="Dependency ledger"
        />

        {licenseManifestStatus === 'loading' && (
          <div className="-mx-6 overflow-hidden">
            {EffectArray.makeBy(6, index => index).map(index => (
              <div key={index} className="border-b border-border/60 px-6 py-3 last:border-b-0">
                <Skeleton className="h-4 w-full max-w-sm" />
              </div>
            ))}
          </div>
        )}

        {licenseManifestStatus === 'error' && licenseManifestError !== null && (
          <StatusNotice tone="critical">{licenseManifestError}</StatusNotice>
        )}

        {licenseManifestStatus === 'success' && licenseManifest !== null && (
          <div className="-mx-6 overflow-hidden">
            {licenseManifest.entries.map(entry => (
              <LicenseRow
                key={entry.id}
                entry={entry}
                expanded={expandedLicenseId === entry.id}
                licenseText={licenseTexts?.texts[entry.textId]}
                licenseTextsError={licenseTextsError}
                licenseTextsStatus={licenseTextsStatus}
                onToggle={onToggleLicense}
              />
            ))}
          </div>
        )}
      </div>
    </motion.section>
  )
}
