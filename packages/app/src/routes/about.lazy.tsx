import { runPromise } from '@memorilo/api-spec'
import { OpenerService } from '@memorilo/api-spec/services/opener'
import { Button } from '@memorilo/components/ui/button'
import { NumberTicker } from '@memorilo/components/ui/number-ticker'
import { Separator } from '@memorilo/components/ui/separator'
import { createLazyFileRoute } from '@tanstack/react-router'
import { Effect, Match } from 'effect'
import { useTranslation } from 'react-i18next'
import { useAboutInfo } from '~/hooks/api'
import Logo from '../../../../src-tauri/icons/icon.png'

export const Route = createLazyFileRoute('/about')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation('app')
  const aboutInfoQuery = useAboutInfo()
  const fallbackAboutInfo = {
    version: '',
    tauriVersion: '',
    clientID: '',
    appLocalDataDir: '',
    gitCommitId: '',
    docNodesCount: 0,
    docUpdatesCount: 0,
  }
  const aboutInfo = Match.value(aboutInfoQuery).pipe(
    Match.when({ status: 'pending' }, () => fallbackAboutInfo),
    Match.when({ status: 'error' }, () => fallbackAboutInfo),
    Match.when({ status: 'success' }, ({ data }) => data),
    Match.exhaustive,
  )

  function handleRevealDir() {
    if (!aboutInfo.appLocalDataDir) {
      return
    }
    runPromise(Effect.gen(function* () {
      const { revealItemInDir } = yield* OpenerService
      yield* revealItemInDir(aboutInfo.appLocalDataDir)
    }))
  }

  return (
    <div className="min-h-full w-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src={Logo}
              alt={t('about.logo_alt')}
              className="h-12 w-12 rounded-md border bg-muted p-1.5"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">{t('about.title')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('about.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-md border bg-muted/40 px-2.5 py-1 font-medium">
              {t('about.version_prefix')}
              {aboutInfo.version}
            </span>
            <span className="inline-flex items-center rounded-md border bg-muted/40 px-2.5 py-1 font-medium">
              {t('about.tauri_label')}
              {' '}
              {aboutInfo.tauriVersion}
            </span>
          </div>
        </div>

        <Separator />

        <div className="rounded-lg border bg-card">
          <div className="flex flex-col divide-y">
            <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('about.document_nodes_label')}</p>
              <NumberTicker className="text-base font-semibold break-all" value={aboutInfo.docNodesCount} />
            </div>
            <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('about.document_updates_label')}</p>
              <NumberTicker className="text-base font-semibold break-all" value={aboutInfo.docUpdatesCount} />
            </div>
            <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('about.client_label')}</p>
              <p className="text-sm font-medium break-all">{aboutInfo.clientID}</p>
            </div>
            <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('about.git_commit_label')}</p>
              <p className="text-sm font-medium break-all">{aboutInfo.gitCommitId || t('about.git_commit_unknown')}</p>
            </div>
            <div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('about.app_data_dir_label')}</p>
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
                <p className="min-w-0 text-sm break-all text-foreground/90">{aboutInfo.appLocalDataDir}</p>
                <Button className="shrink-0" variant="outline" size="sm" onClick={handleRevealDir} disabled={!aboutInfo.appLocalDataDir}>{t('about.reveal_dir')}</Button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
