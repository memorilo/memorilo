import type { ShelfPublication, ShelfReadingFormat, ShelfSource } from '@memorilo/shelf'
import type { FormEvent } from 'react'
import { readingFormatDisplayName } from '@memorilo/reading-model'
import { matchesShelfPublication, shelfReadingAcquisitions } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../../shared/desktop-requests'
import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { noteEditorDialogStyles } from './note-editor-dialogs.stylex'

export interface ShelfBookOption {
  publication: ShelfPublication
  source: ShelfSource
}

export interface EntryCreationTarget {
  kind: 'folder' | 'spreadsheet' | 'topic' | 'whiteboard'
  parentId: string | null
}

export type BookPickerTarget
  = | { kind: 'create', parentId: string | null }
    | { format: ShelfReadingFormat, kind: 'rebind', topicId: string }

async function loadReadableShelfBooks(): Promise<readonly ShelfBookOption[]> {
  const sources = await desktopRequests.listShelfSources()
  const books: ShelfBookOption[] = []
  const seen = new Set<string>()
  for (const source of sources.filter(source => source.enabled)) {
    let pageUrl: string | undefined
    const visitedUrls = new Set<string>()
    while (true) {
      const result = await desktopRequests.refreshShelfView({
        ...(pageUrl === undefined ? {} : { pageUrl }),
        sourceId: source.id,
      })
      const group = result.groups.find(candidate => candidate.source.id === source.id)
      if (!group)
        throw new Error(`Shelf source ${source.id} was not returned`)
      if (group.issue && !group.page)
        throw new Error('Shelf books are unavailable', { cause: group.issue })
      if (group.page) {
        for (const publication of group.page.publications) {
          if (shelfReadingAcquisitions(publication).length === 0)
            continue
          const key = `${source.id}:${publication.id}`
          if (seen.has(key))
            continue
          seen.add(key)
          books.push({ publication, source: group.source })
        }
      }
      const nextUrl = group.page?.nextUrl
      if (nextUrl === null || nextUrl === undefined || visitedUrls.has(nextUrl))
        break
      visitedUrls.add(nextUrl)
      pageUrl = nextUrl
    }
  }
  return books
}

export function BookTopicPickerDialog({
  mode,
  onClose,
  onCreate,
  requiredFormat,
}: {
  mode: 'create' | 'rebind'
  onClose: () => void
  onCreate: (option: ShelfBookOption, format: ShelfReadingFormat) => Promise<void>
  requiredFormat?: ShelfReadingFormat
}) {
  const { t } = useTranslation('editor')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<ShelfReadingFormat | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const booksQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('shelf.list-readable-books', loadReadableShelfBooks),
    queryKey: ['book-topic-shelf-books'],
    retry: false,
    staleTime: 30_000,
  }))
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return (booksQuery.data ?? []).filter(({ publication, source }) => {
      if (requiredFormat !== undefined
        && !shelfReadingAcquisitions(publication).some(acquisition => acquisition.format === requiredFormat)) {
        return false
      }
      return normalizedQuery.length === 0
        || matchesShelfPublication(publication, normalizedQuery)
        || source.name.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [booksQuery.data, query, requiredFormat])
  const selectedOption = useMemo(
    () => (booksQuery.data ?? []).find(({ publication, source }) => `${source.id}:${publication.id}` === selectedKey),
    [booksQuery.data, selectedKey],
  )
  const formats = selectedOption
    ? shelfReadingAcquisitions(selectedOption.publication)
        .filter(acquisition => requiredFormat === undefined || acquisition.format === requiredFormat)
    : []
  const activeFormat = formats.some(acquisition => acquisition.format === selectedFormat)
    ? selectedFormat
    : formats[0]?.format ?? null

  const submit = async () => {
    if (!selectedOption || activeFormat === null)
      return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(selectedOption, activeFormat)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <div {...stylex.props(noteEditorDialogStyles.bookPickerOverlay)}>
      <section
        {...stylex.props(noteEditorDialogStyles.bookPickerDialog)}
        aria-describedby="book-topic-picker-description"
        aria-labelledby="book-topic-picker-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(noteEditorDialogStyles.bookPickerHeader)}>
          <div>
            <h1 id="book-topic-picker-title" {...stylex.props(noteEditorDialogStyles.bookPickerTitle)}>
              {mode === 'rebind' ? t('rebindBook') : t('addBook')}
            </h1>
            <p id="book-topic-picker-description" {...stylex.props(noteEditorDialogStyles.bookPickerDescription)}>
              {mode === 'rebind' ? t('rebindBookDescription') : t('addBookDescription')}
            </p>
          </div>
          <button
            {...stylex.props(noteEditorDialogStyles.inspectorCloseButton)}
            aria-label={t('closeBookPicker')}
            title={t('closeBookPicker')}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div {...stylex.props(noteEditorDialogStyles.bookPickerBody)}>
          {mode === 'rebind'
            ? <p {...stylex.props(noteEditorDialogStyles.bookPickerWarning)}>{t('rebindBookWarning')}</p>
            : null}
          <label {...stylex.props(noteEditorDialogStyles.bookPickerSearch)}>
            <Search aria-hidden="true" size={15} strokeWidth={1.8} />
            <input
              {...stylex.props(noteEditorDialogStyles.bookPickerSearchInput)}
              aria-label={t('searchBooks')}
              placeholder={t('searchBooks')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          {booksQuery.isPending
            ? <p {...stylex.props(noteEditorDialogStyles.bookPickerStatus)} role="status">{t('loadingBooks')}</p>
            : booksQuery.error
              ? <p {...stylex.props(noteEditorDialogStyles.bookPickerError)} role="alert">{t('couldNotLoadBooks')}</p>
              : filteredBooks.length === 0
                ? <p {...stylex.props(noteEditorDialogStyles.bookPickerStatus)}>{t('noReadableBooks')}</p>
                : (
                    <div {...stylex.props(noteEditorDialogStyles.bookPickerList)} role="listbox" aria-label={t('searchBooks')}>
                      {filteredBooks.map((option) => {
                        const key = `${option.source.id}:${option.publication.id}`
                        const formatsForOption = shelfReadingAcquisitions(option.publication)
                        return (
                          <button
                            key={key}
                            {...stylex.props(
                              noteEditorDialogStyles.bookPickerOption,
                              selectedKey === key && noteEditorDialogStyles.bookPickerOptionSelected,
                            )}
                            aria-selected={selectedKey === key}
                            role="option"
                            type="button"
                            onClick={() => {
                              const matchingFormat = formatsForOption.find(
                                acquisition => requiredFormat === undefined || acquisition.format === requiredFormat,
                              )
                              setSelectedKey(key)
                              setSelectedFormat(matchingFormat === undefined ? null : matchingFormat.format)
                              setError(null)
                            }}
                          >
                            <span {...stylex.props(noteEditorDialogStyles.bookPickerOptionText)}>
                              <strong {...stylex.props(noteEditorDialogStyles.bookPickerOptionTitle)}>{option.publication.title}</strong>
                              <span {...stylex.props(noteEditorDialogStyles.bookPickerOptionDetail)}>{option.source.name}</span>
                            </span>
                            <span {...stylex.props(noteEditorDialogStyles.bookPickerFormatList)}>
                              {formatsForOption.map(acquisition => readingFormatDisplayName(acquisition.format)).join(' · ')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
          {selectedOption && formats.length > 0
            ? (
                <label {...stylex.props(noteEditorDialogStyles.bookPickerFormatField)}>
                  <span>{t('bookFormat')}</span>
                  <select
                    {...stylex.props(noteEditorDialogStyles.bookPickerFormatSelect)}
                    value={activeFormat ?? ''}
                    onChange={event => setSelectedFormat(event.target.value as ShelfReadingFormat)}
                  >
                    {formats.map(acquisition => (
                      <option key={acquisition.format} value={acquisition.format}>
                        {readingFormatDisplayName(acquisition.format)}
                      </option>
                    ))}
                  </select>
                </label>
              )
            : null}
          {error
            ? <p {...stylex.props(noteEditorDialogStyles.bookPickerError)} role="alert">{error}</p>
            : null}
        </div>
        <footer {...stylex.props(noteEditorDialogStyles.bookPickerFooter)}>
          <button
            {...stylex.props(noteEditorDialogStyles.bookPickerCancel)}
            disabled={submitting}
            type="button"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            {...stylex.props(noteEditorDialogStyles.bookPickerCreate)}
            disabled={submitting || selectedOption === undefined || activeFormat === null}
            type="button"
            onClick={() => void submit()}
          >
            {submitting
              ? mode === 'rebind' ? t('rebindingBook') : t('addingBook')
              : mode === 'rebind' ? t('rebindBook') : t('addBook')}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function EntryCreationDialog({
  kind,
  onClose,
  onCreate,
}: {
  kind: EntryCreationTarget['kind']
  onClose: () => void
  onCreate: (label: string) => void
}) {
  const { t } = useTranslation('editor')
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const title = kind === 'folder'
    ? t('newFolder')
    : kind === 'spreadsheet'
      ? t('spreadsheet.new')
      : kind === 'whiteboard'
        ? t('newWhiteboard')
        : t('newTopic')
  const fieldLabel = kind === 'folder' ? t('folderName') : t('topicTitle')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = label.trim()
    if (normalized.length === 0) {
      setError(t('entryNameRequired'))
      return
    }
    try {
      onCreate(normalized)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div
      {...stylex.props(noteEditorDialogStyles.bookPickerOverlay)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <form
        {...stylex.props(noteEditorDialogStyles.entryCreationDialog)}
        aria-labelledby="entry-creation-title"
        aria-modal="true"
        role="dialog"
        onSubmit={submit}
      >
        <header {...stylex.props(noteEditorDialogStyles.bookPickerHeader)}>
          <h1 id="entry-creation-title" {...stylex.props(noteEditorDialogStyles.bookPickerTitle)}>{title}</h1>
          <button
            {...stylex.props(noteEditorDialogStyles.inspectorCloseButton)}
            aria-label={t('closeEntryDialog')}
            title={t('closeEntryDialog')}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div {...stylex.props(noteEditorDialogStyles.entryCreationBody)}>
          <label {...stylex.props(noteEditorDialogStyles.entryCreationField)}>
            <span>{fieldLabel}</span>
            <input
              {...stylex.props(noteEditorDialogStyles.entryCreationInput)}
              autoFocus
              required
              value={label}
              onChange={(event) => {
                setLabel(event.target.value)
                setError(null)
              }}
            />
          </label>
          {error
            ? <p {...stylex.props(noteEditorDialogStyles.bookPickerError)} role="alert">{error}</p>
            : null}
        </div>
        <footer {...stylex.props(noteEditorDialogStyles.bookPickerFooter)}>
          <button {...stylex.props(noteEditorDialogStyles.bookPickerCancel)} type="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            {...stylex.props(noteEditorDialogStyles.bookPickerCreate)}
            disabled={label.trim().length === 0}
            type="submit"
          >
            {t('create')}
          </button>
        </footer>
      </form>
    </div>
  )
}
