import { Button, ButtonGroup } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { DatabaseBackup, FileOutput, LoaderCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { desktopRequests } from '../shared/desktop-requests'
import { databaseSettingsStyles as styles } from './database-settings.stylex'

export function DatabaseSettings() {
  const { t } = useTranslation('settings')
  const desktopAvailable = typeof window.desktop !== 'undefined'
  const [pending, setPending] = useState<'export' | 'restore' | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const exportDatabase = async () => {
    if (!desktopAvailable)
      return
    setPending('export')
    setStatus(null)
    try {
      const result = await desktopRequests.exportDatabase()
      if ('status' in result) {
        setStatus(t('databaseExportCancelled'))
        return
      }
      setStatus(t('databaseExported', { path: result.path }))
    }
    catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
    finally {
      setPending(null)
    }
  }

  const restoreDatabase = async () => {
    if (!desktopAvailable)
      return
    setPending('restore')
    setStatus(null)
    try {
      const result = await desktopRequests.restoreDatabase()
      setStatus(result.status === 'cancelled' ? t('databaseRestoreCancelled') : t('databaseRestoreRestarting'))
    }
    catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
    finally {
      setPending(null)
    }
  }

  return (
    <div>
      <ButtonGroup xstyle={styles.actions}>
        <Button
          disabled={pending !== null || !desktopAvailable}
          variant="plain"
          xstyle={styles.button}
          onClick={() => void exportDatabase()}
        >
          {pending === 'export'
            ? <LoaderCircle size={15} strokeWidth={2} />
            : <FileOutput size={15} strokeWidth={2} />}
          <span>{t('exportDatabase')}</span>
        </Button>
        <Button
          disabled={pending !== null || !desktopAvailable}
          variant="plain"
          xstyle={styles.button}
          onClick={() => void restoreDatabase()}
        >
          {pending === 'restore'
            ? <LoaderCircle size={15} strokeWidth={2} />
            : <RotateCcw size={15} strokeWidth={2} />}
          <span>{t('restoreDatabase')}</span>
        </Button>
      </ButtonGroup>
      {status
        ? (
            <p {...stylex.props(styles.status)} role="status">
              <DatabaseBackup size={13} strokeWidth={2} />
              {' '}
              {status}
            </p>
          )
        : null}
    </div>
  )
}
