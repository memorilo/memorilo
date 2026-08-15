import * as stylex from '@stylexjs/stylex'
import { DatabaseBackup, FileOutput, LoaderCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { databaseSettingsStyles as styles } from './database-settings.stylex'

export function DatabaseSettings() {
  const { t } = useTranslation('settings')
  const desktop = typeof window.desktop === 'undefined' ? null : window.desktop
  const [pending, setPending] = useState<'export' | 'restore' | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const exportDatabase = async () => {
    if (!desktop)
      return
    setPending('export')
    setStatus(null)
    try {
      const result = await desktop.exportDatabase()
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
    if (!desktop)
      return
    setPending('restore')
    setStatus(null)
    try {
      const result = await desktop.restoreDatabase()
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
      <div {...stylex.props(styles.actions)}>
        <button
          {...stylex.props(styles.button)}
          disabled={pending !== null || desktop === null}
          type="button"
          onClick={() => void exportDatabase()}
        >
          {pending === 'export'
            ? <LoaderCircle size={15} strokeWidth={2} />
            : <FileOutput size={15} strokeWidth={2} />}
          <span>{t('exportDatabase')}</span>
        </button>
        <button
          {...stylex.props(styles.button)}
          disabled={pending !== null || desktop === null}
          type="button"
          onClick={() => void restoreDatabase()}
        >
          {pending === 'restore'
            ? <LoaderCircle size={15} strokeWidth={2} />
            : <RotateCcw size={15} strokeWidth={2} />}
          <span>{t('restoreDatabase')}</span>
        </button>
      </div>
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
