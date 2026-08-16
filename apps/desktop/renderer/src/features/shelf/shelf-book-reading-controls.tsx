import type { ShelfPublicationDetails, ShelfReadingFormat } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, ChevronDown, Info, LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../shared/desktop-requests'
import { shelfBookReadingStyles as styles } from './shelf-book-reading-controls.stylex'
import { shelfBookShellStyles } from './shelf-book-shell.stylex'
import { desktopEffect, shelfEffectQuery, shelfPublicationQueryKey } from './shelf-query'

const onlineReadingPreferenceKey = 'memorilo.shelf.online-reading.v1'
function initialOnlineReadingPreference(): boolean {
  return window.localStorage.getItem(onlineReadingPreferenceKey) !== 'library'
}

export function ShelfBookReadingControls({
  details,
  openReading,
  publicationId,
  sourceId,
}: {
  details: ShelfPublicationDetails
  openReading: (readingId: string) => Promise<void>
  publicationId: string
  sourceId: string
}) {
  const { t } = useTranslation('app')
  const [onlineReading, setOnlineReading] = useState(initialOnlineReadingPreference)
  const [selectedFormat, setSelectedFormat] = useState<ShelfReadingFormat | null>(null)
  const queryClient = useQueryClient()
  const detailsQueryKey = shelfPublicationQueryKey(sourceId, publicationId)
  const prepareReadingMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (format: ShelfReadingFormat) => desktopEffect('shelf.prepare-reading', () => desktopRequests.prepareShelfReading({
      format,
      publicationId,
      retention: onlineReading ? 'cache' : 'library',
      sourceId,
    })),
    mutationKey: ['shelf-prepare-reading', sourceId, publicationId],
    onSuccess: async (prepared) => {
      if (!onlineReading)
        await queryClient.invalidateQueries({ queryKey: detailsQueryKey })
      await openReading(prepared.readingId)
    },
  }))
  const deleteReadingMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (readingId: string) => desktopEffect('shelf.delete-reading', () => desktopRequests.deleteShelfReading(readingId)),
    mutationKey: ['shelf-delete-reading', sourceId, publicationId],
    onSuccess: async (deleted) => {
      if (deleted)
        await queryClient.invalidateQueries({ queryKey: detailsQueryKey })
    },
  }))
  const selectedReadingOption = details.readingOptions.find(option => option.format === selectedFormat)
    ?? details.readingOptions[0]
    ?? null
  const readingError = prepareReadingMutation.error ?? deleteReadingMutation.error

  const updateOnlineReading = (checked: boolean) => {
    setOnlineReading(checked)
    window.localStorage.setItem(onlineReadingPreferenceKey, checked ? 'cache' : 'library')
    prepareReadingMutation.reset()
  }

  const updateSelectedFormat = (format: ShelfReadingFormat) => {
    setSelectedFormat(format)
    prepareReadingMutation.reset()
    deleteReadingMutation.reset()
  }

  return (
    <>
      <div {...stylex.props(styles.readingActions)}>
        <div {...stylex.props(styles.readControl, prepareReadingMutation.isPending && styles.readControlDisabled)}>
          <button
            {...stylex.props(styles.readButton)}
            aria-busy={prepareReadingMutation.isPending}
            disabled={selectedReadingOption === null || prepareReadingMutation.isPending}
            title={selectedReadingOption === null ? t('shelfNoReadableDownload') : t('shelfReadBook')}
            type="button"
            onClick={() => {
              if (selectedReadingOption)
                prepareReadingMutation.mutate(selectedReadingOption.format)
            }}
          >
            {prepareReadingMutation.isPending
              ? <LoaderCircle {...stylex.props(shelfBookShellStyles.spinner)} aria-hidden="true" size={16} strokeWidth={1.9} />
              : <BookOpen aria-hidden="true" size={16} strokeWidth={1.9} />}
            <span>{prepareReadingMutation.isPending ? t('shelfDownloading') : t('shelfRead')}</span>
          </button>
          {details.readingOptions.length > 1 && selectedReadingOption
            ? (
                <label {...stylex.props(styles.formatPicker)}>
                  <select
                    {...stylex.props(styles.formatSelect)}
                    aria-label={t('shelfReadingFormat')}
                    disabled={prepareReadingMutation.isPending}
                    value={selectedReadingOption.format}
                    onChange={event => updateSelectedFormat(event.target.value as ShelfReadingFormat)}
                  >
                    {details.readingOptions.map(option => (
                      <option key={option.format} value={option.format}>{option.format.toLocaleUpperCase()}</option>
                    ))}
                  </select>
                  <span>{selectedReadingOption.format.toLocaleUpperCase()}</span>
                  <ChevronDown aria-hidden="true" size={12} strokeWidth={2} />
                </label>
              )
            : null}
        </div>
        <label {...stylex.props(styles.onlineReadingOption)}>
          <input
            {...stylex.props(styles.onlineReadingCheckbox)}
            checked={onlineReading}
            disabled={prepareReadingMutation.isPending}
            type="checkbox"
            onChange={event => updateOnlineReading(event.target.checked)}
          />
          <span>{t('shelfOnlineReading')}</span>
        </label>
        <span {...stylex.props(styles.readingHelp)} aria-label={t('shelfOnlineReadingHelp')} role="img" tabIndex={0} title={t('shelfOnlineReadingHelp')}>
          <Info aria-hidden="true" size={14} strokeWidth={1.9} />
        </span>
        {selectedReadingOption?.savedLocally
          ? (
              <button
                {...stylex.props(styles.deleteReadingButton)}
                aria-label={t('shelfDeleteLocalBookFile')}
                disabled={deleteReadingMutation.isPending || prepareReadingMutation.isPending}
                title={t('shelfDeleteLocalFile')}
                type="button"
                onClick={() => deleteReadingMutation.mutate(selectedReadingOption.readingId)}
              >
                {deleteReadingMutation.isPending
                  ? <LoaderCircle {...stylex.props(shelfBookShellStyles.spinner)} aria-hidden="true" size={15} strokeWidth={1.8} />
                  : <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />}
              </button>
            )
          : null}
      </div>
      {readingError ? <p {...stylex.props(styles.readingError)} role="alert">{readingError.message}</p> : null}
    </>
  )
}
