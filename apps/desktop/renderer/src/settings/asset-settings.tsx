import type { DesktopAssetCandidate, DesktopAssetCheckResult } from '@memorilo/desktop-api'
import { Button, ButtonGroup } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { Check, LoaderCircle, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { desktopRequests } from '../shared/desktop-requests'
import { errorMessage } from '../shared/error-message'
import { assetSettingsStyles as settingsStyles } from './asset-settings.stylex'
import { settingsShellStyles } from './settings-shell.stylex'

function formatByteSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function selectedAssets(candidates: readonly DesktopAssetCandidate[], selection: ReadonlySet<string>) {
  return candidates.filter(candidate => selection.has(candidate.fileName))
}

export function AssetSettings() {
  const { t } = useTranslation('settings')
  const desktopAvailable = typeof window.desktop !== 'undefined'
  const [result, setResult] = useState<DesktopAssetCheckResult | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [pending, setPending] = useState<'check' | 'permanent' | 'trash' | null>(null)

  const checkAssets = async () => {
    if (!desktopAvailable)
      return
    setPending('check')
    setStatus(null)
    setResult(null)
    setSelected(new Set())
    setFailed(new Set())
    try {
      const next = await desktopRequests.checkAssets()
      setResult(next)
      setSelected(new Set(next.candidates.map(candidate => candidate.fileName)))
    }
    catch (error) {
      setStatus(errorMessage(error))
    }
    finally {
      setPending(null)
    }
  }

  const reclaim = async (mode: 'permanent' | 'trash') => {
    if (!desktopAvailable || !result)
      return
    const fileNames = mode === 'permanent' ? [...failed] : [...selected]
    if (fileNames.length === 0)
      return
    setPending(mode)
    setStatus(null)
    try {
      const reclaimed = await desktopRequests.reclaimAssets({ fileNames, mode })
      if (reclaimed.cancelled)
        return
      const removed = new Set(reclaimed.reclaimedFileNames)
      const candidates = result.candidates.filter(candidate => !removed.has(candidate.fileName))
      setResult({
        ...result,
        candidates,
        managedAssetCount: result.managedAssetCount - removed.size,
      })
      setSelected(new Set(candidates.map(candidate => candidate.fileName)))
      setFailed(new Set(reclaimed.failedFileNames))
      setStatus(reclaimed.failedFileNames.length > 0
        ? mode === 'trash'
          ? t('assetsCouldNotMoveToTrash', { count: reclaimed.failedFileNames.length })
          : t('assetsCouldNotDeletePermanently', { count: reclaimed.failedFileNames.length })
        : t('assetsReclaimed', { count: reclaimed.reclaimedFileNames.length }))
    }
    catch (error) {
      const message = errorMessage(error)
      try {
        const next = await desktopRequests.checkAssets()
        setResult(next)
        setSelected(new Set(next.candidates.map(candidate => candidate.fileName)))
        setFailed(new Set())
      }
      catch {
        setResult(null)
        setSelected(new Set())
        setFailed(new Set())
      }
      setStatus(message)
    }
    finally {
      setPending(null)
    }
  }

  const selectedItems = result ? selectedAssets(result.candidates, selected) : []
  const selectedBytes = selectedItems.reduce((total, candidate) => total + candidate.byteSize, 0)
  const allSelected = Boolean(result?.candidates.length) && selected.size === result?.candidates.length

  return (
    <section aria-labelledby="assets-settings-heading">
      <h2 id="assets-settings-heading" {...stylex.props(settingsShellStyles.sectionTitle)}>{t('storage')}</h2>
      <div {...stylex.props(settingsShellStyles.settingsGroup)} data-window-no-drag="">
        <div {...stylex.props(settingsStyles.assetActionRow, settingsStyles.compactAssetActionRow)}>
          <div {...stylex.props(settingsStyles.assetCopy)}>
            <span {...stylex.props(settingsStyles.assetLabel)}>{t('assets')}</span>
            <p {...stylex.props(settingsStyles.assetDescription)}>{t('assetsDescription')}</p>
          </div>
          <Button
            disabled={!desktopAvailable || pending !== null}
            variant="plain"
            xstyle={settingsStyles.secondaryButton}
            onClick={() => void checkAssets()}
          >
            {pending === 'check'
              ? <LoaderCircle aria-hidden="true" {...stylex.props(settingsStyles.spinningIcon)} size={14} />
              : <RefreshCw aria-hidden="true" size={14} />}
            <span>{t('checkAssets')}</span>
          </Button>
        </div>

        {result
          ? (
              <div {...stylex.props(settingsStyles.assetResults)}>
                <div {...stylex.props(settingsStyles.assetSummary)}>
                  <span>{t('managedAssets', { count: result.managedAssetCount })}</span>
                  <span>{t('assetReferences', { count: result.referencedAssetCount })}</span>
                  <span>{t('reclaimableAssets', { count: result.candidates.length })}</span>
                  <span>{t('missingAssets', { count: result.missingAssets.length })}</span>
                </div>

                {result.missingAssets.length > 0
                  ? (
                      <div {...stylex.props(settingsStyles.missingAssetWarning)} role="alert">
                        <TriangleAlert aria-hidden="true" size={15} />
                        <div {...stylex.props(settingsStyles.missingAssetCopy)}>
                          <span>{t('referencedAssetFilesMissing', { count: result.missingAssets.length })}</span>
                          {result.missingAssets.map(asset => (
                            <span key={asset.fileName} {...stylex.props(settingsStyles.missingAssetName)} title={asset.fileName}>
                              {`${asset.originalFileName} · ${t('assetReferences', { count: asset.referenceCount })}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  : null}

                {result.candidates.length > 0
                  ? (
                      <>
                        <div {...stylex.props(settingsStyles.assetSelectionHeader)}>
                          <Button
                            variant="plain"
                            xstyle={settingsStyles.inlineButton}
                            onClick={() => setSelected(allSelected
                              ? new Set()
                              : new Set(result.candidates.map(candidate => candidate.fileName)))}
                          >
                            {allSelected ? t('selectNone') : t('selectAll')}
                          </Button>
                          <span>{t('selectedAssetSize', { count: selected.size, size: formatByteSize(selectedBytes) })}</span>
                        </div>
                        <div {...stylex.props(settingsStyles.assetList)}>
                          {result.candidates.map(candidate => (
                            <label key={candidate.fileName} {...stylex.props(settingsStyles.assetItem)}>
                              <input
                                checked={selected.has(candidate.fileName)}
                                type="checkbox"
                                onChange={(event) => {
                                  const next = new Set(selected)
                                  if (event.target.checked)
                                    next.add(candidate.fileName)
                                  else
                                    next.delete(candidate.fileName)
                                  setSelected(next)
                                }}
                              />
                              <span {...stylex.props(settingsStyles.assetName)} title={candidate.originalFileName}>
                                {candidate.originalFileName}
                              </span>
                              <span {...stylex.props(settingsStyles.assetSize)}>{formatByteSize(candidate.byteSize)}</span>
                            </label>
                          ))}
                        </div>
                        <ButtonGroup xstyle={settingsStyles.assetButtons}>
                          <Button
                            disabled={selected.size === 0 || pending !== null}
                            variant="plain"
                            xstyle={settingsStyles.dangerButton}
                            onClick={() => void reclaim('trash')}
                          >
                            {pending === 'trash'
                              ? <LoaderCircle aria-hidden="true" {...stylex.props(settingsStyles.spinningIcon)} size={14} />
                              : <Trash2 aria-hidden="true" size={14} />}
                            <span>{t('moveToTrash')}</span>
                          </Button>
                          {failed.size > 0
                            ? (
                                <Button
                                  disabled={pending !== null}
                                  variant="plain"
                                  xstyle={settingsStyles.warningButton}
                                  onClick={() => void reclaim('permanent')}
                                >
                                  <TriangleAlert aria-hidden="true" size={14} />
                                  <span>{t('permanentlyDeleteFailed')}</span>
                                </Button>
                              )
                            : null}
                        </ButtonGroup>
                      </>
                    )
                  : (
                      <div {...stylex.props(settingsStyles.emptyAssets)}>
                        <Check aria-hidden="true" size={15} />
                        <span>{t('noReclaimableAssets')}</span>
                      </div>
                    )}
              </div>
            )
          : null}

        {status
          ? <p {...stylex.props(settingsStyles.assetStatus)} role="status">{status}</p>
          : null}
      </div>
    </section>
  )
}
