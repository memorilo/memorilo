import type { ReactNode } from 'react'
import type { ContributorDefinition } from '~/lib/contributors'
import type { ThirdPartyLicenseManifestEntry } from '~/lib/licenses'
import { Avatar, AvatarFallback, AvatarImage } from '@memorilo/components/ui/avatar'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { cn } from '@memorilo/utils'
import { Array as EffectArray, String as EffectString, pipe } from 'effect'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowUpRight, LuChevronDown } from 'react-icons/lu'

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  description?: string
  eyebrow: string
  title: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-muted-foreground">{eyebrow}</p>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description !== undefined && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}

export function StatusNotice({
  tone = 'neutral',
  children,
}: {
  children: ReactNode
  tone?: 'critical' | 'neutral'
}) {
  return (
    <div
      className={cn(
        'rounded-sm px-4 py-3 text-sm leading-6',
        tone === 'critical'
          ? 'bg-destructive/8 text-destructive'
          : 'bg-muted/25 text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}

export function DetailRow({
  icon,
  label,
  value,
  action,
}: {
  action?: ReactNode
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-6 py-4 last:border-b-0">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
        <span className="text-foreground/70">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 text-sm leading-6 text-foreground/90">{value}</div>
        {action}
      </div>
    </div>
  )
}

export function ContributorCard({
  contributor,
  onOpen,
}: {
  contributor: ContributorDefinition
  onOpen: (url: string) => void
}) {
  const nicknameParts = pipe(
    contributor.nickname,
    EffectString.trim,
    EffectString.split(/\s+/),
    EffectArray.filter(EffectString.isNonEmpty),
  )

  if (nicknameParts.length === 0) {
    throw new Error('Contributor name must not be empty')
  }

  const initials = nicknameParts.length === 1
    ? pipe(nicknameParts[0], EffectString.takeLeft(2), EffectString.toUpperCase)
    : pipe(
        nicknameParts,
        EffectArray.take(2),
        EffectArray.map(part => pipe(part, EffectString.takeLeft(1))),
        EffectArray.join(''),
        EffectString.toUpperCase,
      )

  return (
    <button
      type="button"
      onClick={() => onOpen(contributor.profileUrl)}
      className="group flex w-full items-center gap-3 px-0 py-0 text-left transition duration-200 hover:opacity-80"
    >
      <Avatar className="size-9">
        <AvatarImage src={contributor.avatarUrl} alt={`${contributor.nickname} avatar`} />
        <AvatarFallback
          className="text-xs font-semibold"
          style={{
            backgroundColor: contributor.avatarBackground,
            color: contributor.accent,
          }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <p className="text-sm font-medium text-foreground">{contributor.nickname}</p>
          <span className="text-[10px] uppercase text-muted-foreground">
            @
            {contributor.username}
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{contributor.role}</p>
      </div>
      <LuArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

export function LicenseRow({
  entry,
  expanded,
  licenseText,
  licenseTextsError,
  licenseTextsStatus,
  onToggle,
}: {
  entry: ThirdPartyLicenseManifestEntry
  expanded: boolean
  licenseText: string | undefined
  licenseTextsError: string | null
  licenseTextsStatus: 'error' | 'idle' | 'loading' | 'success'
  onToggle: (entry: ThirdPartyLicenseManifestEntry) => void
}) {
  return (
    <div className="overflow-hidden border-b border-border/60 px-6 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(entry)}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center gap-3 px-0 py-3 text-left transition duration-150',
          'hover:text-foreground/85',
        )}
      >
        <div className="min-w-0 flex flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="min-w-0 text-sm text-foreground">{entry.name}</p>
          <span className="text-xs text-muted-foreground">{entry.version}</span>
          <span className="text-xs font-medium text-muted-foreground">{entry.license}</span>
        </div>
        <motion.span
          className="flex shrink-0 items-center justify-center text-muted-foreground"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <LuChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded
          ? (
              <motion.div
                key={entry.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="-mx-6 border-t border-border/60 px-6 pb-3 pt-3">
                  {licenseTextsStatus === 'loading' && (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-10/12" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  )}

                  {licenseTextsStatus === 'error' && licenseTextsError !== null && (
                    <StatusNotice tone="critical">{licenseTextsError}</StatusNotice>
                  )}

                  {licenseTextsStatus === 'success' && licenseText === undefined && (
                    <StatusNotice tone="critical">
                      License text
                      {' '}
                      <span className="font-mono">{entry.textId}</span>
                      {' '}
                      is missing from the generated build asset.
                    </StatusNotice>
                  )}

                  {licenseTextsStatus === 'success' && licenseText !== undefined && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words border-l border-border/60 pl-4 text-xs leading-6 text-foreground/80">
                      {licenseText}
                    </pre>
                  )}
                </div>
              </motion.div>
            )
          : null}
      </AnimatePresence>
    </div>
  )
}
