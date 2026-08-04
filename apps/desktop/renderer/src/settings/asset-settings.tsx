import type { DesktopAssetCandidate, DesktopAssetCheckResult } from '@memorilo/desktop-preload'
import * as stylex from '@stylexjs/stylex'
import { Check, LoaderCircle, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { settingsStyles } from './settings.stylex'

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
  const desktop = typeof window.desktop === 'undefined' ? null : window.desktop
  const [result, setResult] = useState<DesktopAssetCheckResult | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [pending, setPending] = useState<'check' | 'permanent' | 'trash' | null>(null)

  const checkAssets = async () => {
    if (!desktop)
      return
    setPending('check')
    setStatus(null)
    setResult(null)
    setSelected(new Set())
    setFailed(new Set())
    try {
      const next = await desktop.checkAssets()
      setResult(next)
      setSelected(new Set(next.candidates.map(candidate => candidate.fileName)))
    }
    catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
    finally {
      setPending(null)
    }
  }

  const reclaim = async (mode: 'permanent' | 'trash') => {
    if (!desktop || !result)
      return
    const fileNames = mode === 'permanent' ? [...failed] : [...selected]
    if (fileNames.length === 0)
      return
    setPending(mode)
    setStatus(null)
    try {
      const reclaimed = await desktop.reclaimAssets({ fileNames, mode })
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
        ? `${reclaimed.failedFileNames.length} file${reclaimed.failedFileNames.length === 1 ? '' : 's'} could not be ${mode === 'trash' ? 'moved to Trash' : 'permanently deleted'}.`
        : `${reclaimed.reclaimedFileNames.length} asset${reclaimed.reclaimedFileNames.length === 1 ? '' : 's'} reclaimed.`)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        const next = await desktop.checkAssets()
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
      <h2 id="assets-settings-heading" {...stylex.props(settingsStyles.sectionTitle)}>Storage</h2>
      <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
        <div {...stylex.props(settingsStyles.assetActionRow, settingsStyles.compactAssetActionRow)}>
          <div {...stylex.props(settingsStyles.assetCopy)}>
            <span {...stylex.props(settingsStyles.assetLabel)}>Assets</span>
            <p {...stylex.props(settingsStyles.assetDescription)}>
              Find managed image files that are no longer referenced by any note.
            </p>
          </div>
          <button
            {...stylex.props(settingsStyles.secondaryButton)}
            disabled={!desktop || pending !== null}
            type="button"
            onClick={() => void checkAssets()}
          >
            {pending === 'check'
              ? <LoaderCircle aria-hidden="true" {...stylex.props(settingsStyles.spinningIcon)} size={14} />
              : <RefreshCw aria-hidden="true" size={14} />}
            <span>Check Assets</span>
          </button>
        </div>

        {result
          ? (
              <div {...stylex.props(settingsStyles.assetResults)}>
                <div {...stylex.props(settingsStyles.assetSummary)}>
                  <span>{`${result.managedAssetCount} managed`}</span>
                  <span>{`${result.referencedAssetCount} references`}</span>
                  <span>{`${result.candidates.length} reclaimable`}</span>
                  <span>{`${result.missingAssets.length} missing`}</span>
                </div>

                {result.missingAssets.length > 0
                  ? (
                      <div {...stylex.props(settingsStyles.missingAssetWarning)} role="alert">
                        <TriangleAlert aria-hidden="true" size={15} />
                        <div {...stylex.props(settingsStyles.missingAssetCopy)}>
                          <span>{`${result.missingAssets.length} referenced asset file${result.missingAssets.length === 1 ? ' is' : 's are'} missing.`}</span>
                          {result.missingAssets.map(asset => (
                            <span key={asset.fileName} {...stylex.props(settingsStyles.missingAssetName)} title={asset.fileName}>
                              {`${asset.originalFileName} · ${asset.referenceCount} reference${asset.referenceCount === 1 ? '' : 's'}`}
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
                          <button
                            {...stylex.props(settingsStyles.inlineButton)}
                            type="button"
                            onClick={() => setSelected(allSelected
                              ? new Set()
                              : new Set(result.candidates.map(candidate => candidate.fileName)))}
                          >
                            {allSelected ? 'Select None' : 'Select All'}
                          </button>
                          <span>{`${selected.size} selected · ${formatByteSize(selectedBytes)}`}</span>
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
                        <div {...stylex.props(settingsStyles.assetButtons)}>
                          <button
                            {...stylex.props(settingsStyles.dangerButton)}
                            disabled={selected.size === 0 || pending !== null}
                            type="button"
                            onClick={() => void reclaim('trash')}
                          >
                            {pending === 'trash'
                              ? <LoaderCircle aria-hidden="true" {...stylex.props(settingsStyles.spinningIcon)} size={14} />
                              : <Trash2 aria-hidden="true" size={14} />}
                            <span>Move to Trash</span>
                          </button>
                          {failed.size > 0
                            ? (
                                <button
                                  {...stylex.props(settingsStyles.warningButton)}
                                  disabled={pending !== null}
                                  type="button"
                                  onClick={() => void reclaim('permanent')}
                                >
                                  <TriangleAlert aria-hidden="true" size={14} />
                                  <span>Permanently Delete Failed</span>
                                </button>
                              )
                            : null}
                        </div>
                      </>
                    )
                  : (
                      <div {...stylex.props(settingsStyles.emptyAssets)}>
                        <Check aria-hidden="true" size={15} />
                        <span>No reclaimable assets</span>
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
