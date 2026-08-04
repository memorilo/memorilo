import type { ShelfPublication, ShelfPublicationLink, ShelfReadingFormat } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, Info, LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { usePageTitlebar } from '../components/page-titlebar'
import { shelfBookStyles } from './-shelf-book.stylex'
import { useShelfCover } from './-shelf-cover'
import { desktopEffect, shelfEffectQuery } from './-shelf-data'
import { shelfFormatName, shelfPublicationQueryKey } from './-shelf-publication'

interface ShelfBookSearch {
  publication: string
  source: string
}

interface MetadataRow {
  label: string
  value: string
}

interface PublicationMetadata {
  information: readonly MetadataRow[]
  technical: readonly MetadataRow[]
}

const shelfBookRouteApi = getRouteApi('/shelf_/book')
const shelfBookTitlebar = {} as const
const onlineReadingPreferenceKey = 'memorilo.shelf.online-reading.v1'
const onlineReadingHelp = 'When enabled, this book is kept temporarily and may be removed when the cache is full. Turn it off to keep the book until you delete it.'

function initialOnlineReadingPreference(): boolean {
  return window.localStorage.getItem(onlineReadingPreferenceKey) !== 'library'
}

function requiredSearchValue(search: Record<string, unknown>, name: keyof ShelfBookSearch): string {
  const value = search[name]
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`Shelf book details require a ${name} value`)
  return value
}

function validateShelfBookSearch(search: Record<string, unknown>): ShelfBookSearch {
  return {
    publication: requiredSearchValue(search, 'publication'),
    source: requiredSearchValue(search, 'source'),
  }
}

function formatAuthors(publication: ShelfPublication): string {
  return publication.authors.length === 0 ? 'Unknown author' : publication.authors.join(', ')
}

function acquisitionLinks(publication: ShelfPublication): readonly ShelfPublicationLink[] {
  return publication.links.filter(link => link.rel.includes('acquisition'))
}

function formatNames(publication: ShelfPublication): readonly string[] {
  return [...new Set(acquisitionLinks(publication).map(link => shelfFormatName(link.type)))]
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))]
}

function formatDate(value: string): string {
  const calendarMatch = /^(\d{1,4})-(\d{2})-(\d{2})/u.exec(value)
  if (calendarMatch) {
    const [, yearValue, monthValue, dayValue] = calendarMatch
    const year = Number(yearValue)
    const month = Number(monthValue)
    const day = Number(dayValue)
    const date = new Date(0)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCFullYear(year, month - 1, day)
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day)
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
  }
  return value
}

function formatLanguage(value: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(value) ?? value
  }
  catch (error) {
    if (!(error instanceof RangeError))
      throw error
    return value
  }
}

function formatDuration(seconds: number): string {
  const roundedMinutes = Math.max(1, Math.round(seconds / 60))
  if (roundedMinutes < 60)
    return `${roundedMinutes} min`
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}

function formatReadingProgression(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    btt: 'Bottom to top',
    ltr: 'Left to right',
    rtl: 'Right to left',
    ttb: 'Top to bottom',
  }
  return labels[value] ?? value
}

function roleLabel(role: string, count: number): string {
  const label = role === 'penciler'
    ? 'Penciler'
    : `${role.charAt(0).toLocaleUpperCase()}${role.slice(1)}`
  return count === 1 ? label : `${label}s`
}

function publicationMetadata(
  publication: ShelfPublication,
  sourceName: string,
  formats: readonly string[],
): PublicationMetadata {
  const information: MetadataRow[] = []
  const technical: MetadataRow[] = []
  const metadata = publication.metadata
  if (metadata) {
    const appendInformation = (label: string, values: readonly string[]) => {
      const unique = uniqueValues(values)
      if (unique.length > 0)
        information.push({ label, value: unique.join(', ') })
    }
    const appendTechnical = (label: string, values: readonly string[]) => {
      const unique = uniqueValues(values)
      if (unique.length > 0)
        technical.push({ label, value: unique.join(', ') })
    }

    appendInformation('Publisher', metadata.publishers)
    appendInformation('Imprint', metadata.imprints)
    if (metadata.published)
      information.push({ label: 'Published', value: formatDate(metadata.published) })
    if (metadata.modified)
      information.push({ label: 'Updated', value: formatDate(metadata.modified) })
    appendInformation('Language', metadata.languages.map(formatLanguage))

    const series = metadata.collections
      .filter(collection => collection.type === 'series')
      .map(collection => collection.position === null ? collection.name : `${collection.name} · ${collection.position}`)
    const collections = metadata.collections
      .filter(collection => collection.type === 'collection')
      .map(collection => collection.position === null ? collection.name : `${collection.name} · ${collection.position}`)
    appendInformation('Series', series)
    appendInformation('Collection', collections)
    appendInformation('Tags', metadata.subjects.map(subject => subject.name))

    const contributorGroups = new Map<string, string[]>()
    for (const contributor of metadata.contributors) {
      const names = contributorGroups.get(contributor.role) ?? []
      names.push(contributor.name)
      contributorGroups.set(contributor.role, names)
    }
    for (const [role, names] of contributorGroups)
      appendInformation(roleLabel(role, names.length), names)

    if (metadata.numberOfPages !== null)
      information.push({ label: 'Length', value: `${metadata.numberOfPages.toLocaleString()} pages` })
    if (metadata.duration !== null)
      information.push({ label: 'Duration', value: formatDuration(metadata.duration) })
    if (metadata.rights)
      information.push({ label: 'Rights', value: metadata.rights })

    appendTechnical('Type', metadata.types)
    appendTechnical('Conforms To', metadata.conformsTo)
    appendTechnical(
      'Subject Codes',
      metadata.subjects.flatMap((subject) => {
        if (subject.code === null)
          return []
        const scheme = subject.scheme === null ? '' : ` (${subject.scheme})`
        return [`${subject.name}: ${subject.code}${scheme}`]
      }),
    )
    if (metadata.readingProgression)
      technical.push({ label: 'Reading', value: formatReadingProgression(metadata.readingProgression) })
    appendTechnical('Access Modes', metadata.accessibilityModes)
    appendTechnical('Accessibility', metadata.accessibilityFeatures)
    appendTechnical('Access Hazards', metadata.accessibilityHazards)
    if (metadata.accessibilitySummary)
      technical.push({ label: 'Access Notes', value: metadata.accessibilitySummary })
    appendTechnical('Identifier', metadata.identifiers.length > 0 ? metadata.identifiers : [publication.id])
  }
  else {
    technical.push({ label: 'Identifier', value: publication.id })
  }
  appendMetadataRow(technical, 'Format', formats)
  technical.push({ label: 'Book Source', value: sourceName })
  return { information, technical }
}

function appendMetadataRow(rows: MetadataRow[], label: string, values: readonly string[]): void {
  const unique = uniqueValues(values)
  if (unique.length > 0)
    rows.push({ label, value: unique.join(', ') })
}

function plainTextSummary(value: string | null): string | null {
  if (value === null)
    return null
  const document = new DOMParser().parseFromString(value, 'text/html')
  const blocks = [...document.body.children]
    .map(element => element.textContent?.trim())
    .filter((text): text is string => Boolean(text))
  const text = blocks.length > 0 ? blocks.join('\n\n') : document.body.textContent?.trim()
  return text && text.length > 0 ? text : null
}

function BookCover({ publication, sourceId }: { publication: ShelfPublication, sourceId: string }) {
  const cover = useShelfCover(sourceId, publication.coverUrl, true)
  const statusLabel = cover.state === 'loading'
    ? `Loading cover for ${publication.title}`
    : cover.state === 'error'
      ? `Cover unavailable for ${publication.title}`
      : cover.state === 'missing'
        ? `No cover available for ${publication.title}`
        : `Cover for ${publication.title}`

  return (
    <div
      {...stylex.props(shelfBookStyles.coverFrame)}
      aria-busy={cover.state === 'loading'}
      aria-label={statusLabel}
      role={cover.state === 'loading' || cover.state === 'error' ? 'status' : 'img'}
    >
      {cover.state === 'loaded' && cover.imageUrl
        ? <img {...stylex.props(shelfBookStyles.coverImage)} alt="" decoding="async" height={406} src={cover.imageUrl} width={280} />
        : (
            <div
              {...stylex.props(
                shelfBookStyles.coverPlaceholder,
                cover.state === 'loading' && shelfBookStyles.coverPlaceholderLoading,
                cover.state === 'error' && shelfBookStyles.coverPlaceholderError,
              )}
              aria-hidden="true"
            >
              {cover.state === 'loading'
                ? <LoaderCircle {...stylex.props(shelfBookStyles.spinner)} size={25} strokeWidth={1.45} />
                : cover.state === 'error'
                  ? <AlertCircle size={25} strokeWidth={1.45} />
                  : <BookOpen size={25} strokeWidth={1.35} />}
              <span {...stylex.props(shelfBookStyles.placeholderTitle)}>{publication.title}</span>
            </div>
          )}
    </div>
  )
}

function ShelfBookRoute() {
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false)
  const [onlineReading, setOnlineReading] = useState(initialOnlineReadingPreference)
  const [selectedFormat, setSelectedFormat] = useState<ShelfReadingFormat | null>(null)
  const search = shelfBookRouteApi.useSearch()
  const navigate = shelfBookRouteApi.useNavigate()
  const queryClient = useQueryClient()
  const detailsQueryKey = shelfPublicationQueryKey(search.source, search.publication)
  const detailsQuery = useQuery(shelfEffectQuery.queryOptions({
    queryFn: () => desktopEffect(() => window.desktop.getShelfPublicationDetails({
      publicationId: search.publication,
      sourceId: search.source,
    })),
    queryKey: detailsQueryKey,
    retry: false,
    staleTime: 0,
  }))
  const prepareReadingMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (format: ShelfReadingFormat) => desktopEffect(() => window.desktop.prepareShelfReading({
      format,
      publicationId: search.publication,
      retention: onlineReading ? 'cache' : 'library',
      sourceId: search.source,
    })),
    mutationKey: ['shelf-prepare-reading', search.source, search.publication],
    onSuccess: async (prepared) => {
      if (!onlineReading)
        await queryClient.invalidateQueries({ queryKey: detailsQueryKey })
      await navigate({ params: { readingId: prepared.readingId }, to: '/reader/$readingId' })
    },
  }))
  const deleteReadingMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (readingId: string) => desktopEffect(() => window.desktop.deleteShelfReading(readingId)),
    mutationKey: ['shelf-delete-reading', search.source, search.publication],
    onSuccess: async (deleted) => {
      if (deleted)
        await queryClient.invalidateQueries({ queryKey: detailsQueryKey })
    },
  }))
  usePageTitlebar(shelfBookTitlebar)

  const details = detailsQuery.data
  const selectedReadingOption = details?.readingOptions.find(option => option.format === selectedFormat)
    ?? details?.readingOptions[0]
    ?? null
  const summary = details ? plainTextSummary(details.publication.summary) : null
  const formats = details ? formatNames(details.publication) : []
  const metadata = details
    ? publicationMetadata(details.publication, details.source.name, formats)
    : { information: [], technical: [] }
  const headlineFacts = details
    ? uniqueValues([
        ...formats,
        ...(details.publication.metadata?.languages.map(formatLanguage) ?? []),
        details.source.name,
      ])
    : []
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
    <main {...stylex.props(shelfBookStyles.page)} aria-label="Book details">
      <div {...stylex.props(shelfBookStyles.scrollViewport)}>
        {detailsQuery.isPending
          ? (
              <div {...stylex.props(shelfBookStyles.status)} role="status">
                <LoaderCircle {...stylex.props(shelfBookStyles.spinner)} size={22} strokeWidth={1.6} aria-hidden="true" />
                <span>Opening book details…</span>
              </div>
            )
          : detailsQuery.error
            ? (
                <div {...stylex.props(shelfBookStyles.status)} role="alert">
                  <AlertCircle size={28} strokeWidth={1.5} aria-hidden="true" />
                  <h1 {...stylex.props(shelfBookStyles.statusTitle)}>Couldn’t open this book</h1>
                  <p {...stylex.props(shelfBookStyles.statusText)}>{detailsQuery.error.message}</p>
                  <Link {...stylex.props(shelfBookStyles.shelfLink)} search={{}} to="/shelf">Back to Shelf</Link>
                </div>
              )
            : details
              ? (
                  <div {...stylex.props(shelfBookStyles.content)}>
                    <section {...stylex.props(shelfBookStyles.overview)} aria-labelledby="book-title">
                      <div {...stylex.props(shelfBookStyles.coverColumn)}>
                        <BookCover publication={details.publication} sourceId={details.source.id} />
                      </div>
                      <div {...stylex.props(shelfBookStyles.information)}>
                        <h1 id="book-title" {...stylex.props(shelfBookStyles.title)}>{details.publication.title}</h1>
                        {details.publication.subtitle
                          ? <p {...stylex.props(shelfBookStyles.subtitle)}>{details.publication.subtitle}</p>
                          : null}
                        <p {...stylex.props(shelfBookStyles.authors)}>{formatAuthors(details.publication)}</p>
                        {headlineFacts.length > 0
                          ? (
                              <p {...stylex.props(shelfBookStyles.headlineFacts)}>
                                {headlineFacts.map((fact, index) => (
                                  <span key={fact} {...stylex.props(shelfBookStyles.headlineFact)}>
                                    {index > 0 ? <span {...stylex.props(shelfBookStyles.factSeparator)} aria-hidden="true">·</span> : null}
                                    {fact}
                                  </span>
                                ))}
                              </p>
                            )
                          : null}
                        <div {...stylex.props(shelfBookStyles.readingActions)}>
                          <div
                            {...stylex.props(
                              shelfBookStyles.readControl,
                              prepareReadingMutation.isPending && shelfBookStyles.readControlDisabled,
                            )}
                          >
                            <button
                              {...stylex.props(shelfBookStyles.readButton)}
                              aria-busy={prepareReadingMutation.isPending}
                              disabled={selectedReadingOption === null || prepareReadingMutation.isPending}
                              title={selectedReadingOption === null ? 'No readable EPUB or PDF download is available' : 'Read this book'}
                              type="button"
                              onClick={() => {
                                if (selectedReadingOption)
                                  prepareReadingMutation.mutate(selectedReadingOption.format)
                              }}
                            >
                              {prepareReadingMutation.isPending
                                ? <LoaderCircle {...stylex.props(shelfBookStyles.spinner)} aria-hidden="true" size={16} strokeWidth={1.9} />
                                : <BookOpen aria-hidden="true" size={16} strokeWidth={1.9} />}
                              <span>{prepareReadingMutation.isPending ? 'Downloading…' : 'Read'}</span>
                            </button>
                            {details.readingOptions.length > 1 && selectedReadingOption
                              ? (
                                  <label {...stylex.props(shelfBookStyles.formatPicker)}>
                                    <select
                                      {...stylex.props(shelfBookStyles.formatSelect)}
                                      aria-label="Reading format"
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
                          <label {...stylex.props(shelfBookStyles.onlineReadingOption)}>
                            <input
                              {...stylex.props(shelfBookStyles.onlineReadingCheckbox)}
                              checked={onlineReading}
                              disabled={prepareReadingMutation.isPending}
                              type="checkbox"
                              onChange={event => updateOnlineReading(event.target.checked)}
                            />
                            <span>Online reading</span>
                          </label>
                          <span
                            {...stylex.props(shelfBookStyles.readingHelp)}
                            aria-label={onlineReadingHelp}
                            role="img"
                            tabIndex={0}
                            title={onlineReadingHelp}
                          >
                            <Info aria-hidden="true" size={14} strokeWidth={1.9} />
                          </span>
                          {selectedReadingOption?.savedLocally
                            ? (
                                <button
                                  {...stylex.props(shelfBookStyles.deleteReadingButton)}
                                  aria-label="Delete local book file"
                                  disabled={deleteReadingMutation.isPending || prepareReadingMutation.isPending}
                                  title="Delete local file"
                                  type="button"
                                  onClick={() => deleteReadingMutation.mutate(selectedReadingOption.readingId)}
                                >
                                  {deleteReadingMutation.isPending
                                    ? <LoaderCircle {...stylex.props(shelfBookStyles.spinner)} aria-hidden="true" size={15} strokeWidth={1.8} />
                                    : <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />}
                                </button>
                              )
                            : null}
                        </div>
                        {readingError
                          ? <p {...stylex.props(shelfBookStyles.readingError)} role="alert">{readingError.message}</p>
                          : null}
                      </div>
                      <section {...stylex.props(shelfBookStyles.description)} aria-labelledby="book-description-title">
                        <h2 id="book-description-title" {...stylex.props(shelfBookStyles.sectionTitle)}>Description</h2>
                        {summary
                          ? <p {...stylex.props(shelfBookStyles.descriptionText)}>{summary}</p>
                          : <p {...stylex.props(shelfBookStyles.descriptionUnavailable)}>No description provided by this book source.</p>}
                      </section>
                      {metadata.information.length > 0
                        ? (
                            <section {...stylex.props(shelfBookStyles.metadataInspector)} aria-labelledby="book-information-title">
                              <h2 id="book-information-title" {...stylex.props(shelfBookStyles.inspectorTitle)}>Information</h2>
                              <dl {...stylex.props(shelfBookStyles.metadataGrid)}>
                                {metadata.information.map(row => (
                                  <div key={`${row.label}:${row.value}`} {...stylex.props(shelfBookStyles.metadataItem)}>
                                    <dt {...stylex.props(shelfBookStyles.metadataTerm)}>{row.label}</dt>
                                    <dd {...stylex.props(shelfBookStyles.metadataValue)}>{row.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </section>
                          )
                        : null}
                      <section {...stylex.props(shelfBookStyles.technicalSection)} aria-labelledby="book-technical-title">
                        <button
                          {...stylex.props(shelfBookStyles.disclosureButton)}
                          aria-controls="book-technical-metadata"
                          aria-expanded={technicalDetailsOpen}
                          id="book-technical-title"
                          onClick={() => setTechnicalDetailsOpen(open => !open)}
                          type="button"
                        >
                          <ChevronRight
                            {...stylex.props(
                              shelfBookStyles.disclosureIcon,
                              technicalDetailsOpen && shelfBookStyles.disclosureIconOpen,
                            )}
                            aria-hidden="true"
                            size={15}
                            strokeWidth={1.8}
                          />
                          <span>Technical Details</span>
                        </button>
                        {technicalDetailsOpen
                          ? (
                              <dl id="book-technical-metadata" {...stylex.props(shelfBookStyles.technicalMetadata)}>
                                {metadata.technical.map(row => (
                                  <div key={`${row.label}:${row.value}`} {...stylex.props(shelfBookStyles.technicalRow)}>
                                    <dt {...stylex.props(shelfBookStyles.metadataTerm)}>{row.label}</dt>
                                    <dd {...stylex.props(shelfBookStyles.metadataValue)}>{row.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            )
                          : null}
                      </section>
                    </section>
                  </div>
                )
              : null}
      </div>
    </main>
  )
}

export const Route = createFileRoute('/shelf_/book')({
  component: ShelfBookRoute,
  validateSearch: validateShelfBookSearch,
})
