import type { ShelfPublication } from '@memorilo/shelf'
import { shelfFormatName } from './publication/shelf-publication-collection'

export interface ShelfBookMetadataRow {
  label: string
  value: string
}

export interface ShelfBookMetadataProjection {
  formats: readonly string[]
  headlineFacts: readonly string[]
  information: readonly ShelfBookMetadataRow[]
  summary: string | null
  technical: readonly ShelfBookMetadataRow[]
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

function appendMetadataRow(
  rows: ShelfBookMetadataRow[],
  label: string,
  values: readonly string[],
): void {
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

export function projectShelfBookMetadata(
  publication: ShelfPublication,
  sourceName: string,
): ShelfBookMetadataProjection {
  const formats = uniqueValues(publication.links
    .filter(link => link.rel.includes('acquisition'))
    .map(link => shelfFormatName(link.type)))
  const information: ShelfBookMetadataRow[] = []
  const technical: ShelfBookMetadataRow[] = []
  const metadata = publication.metadata

  if (metadata) {
    appendMetadataRow(information, 'Publisher', metadata.publishers)
    appendMetadataRow(information, 'Imprint', metadata.imprints)
    if (metadata.published)
      information.push({ label: 'Published', value: formatDate(metadata.published) })
    if (metadata.modified)
      information.push({ label: 'Updated', value: formatDate(metadata.modified) })
    appendMetadataRow(information, 'Language', metadata.languages.map(formatLanguage))

    const series = metadata.collections
      .filter(collection => collection.type === 'series')
      .map(collection => collection.position === null ? collection.name : `${collection.name} · ${collection.position}`)
    const collections = metadata.collections
      .filter(collection => collection.type === 'collection')
      .map(collection => collection.position === null ? collection.name : `${collection.name} · ${collection.position}`)
    appendMetadataRow(information, 'Series', series)
    appendMetadataRow(information, 'Collection', collections)
    appendMetadataRow(information, 'Tags', metadata.subjects.map(subject => subject.name))

    const contributorGroups = new Map<string, string[]>()
    for (const contributor of metadata.contributors) {
      const names = contributorGroups.get(contributor.role) ?? []
      names.push(contributor.name)
      contributorGroups.set(contributor.role, names)
    }
    for (const [role, names] of contributorGroups)
      appendMetadataRow(information, roleLabel(role, names.length), names)

    if (metadata.numberOfPages !== null)
      information.push({ label: 'Length', value: `${metadata.numberOfPages.toLocaleString()} pages` })
    if (metadata.duration !== null)
      information.push({ label: 'Duration', value: formatDuration(metadata.duration) })
    if (metadata.rights)
      information.push({ label: 'Rights', value: metadata.rights })

    appendMetadataRow(technical, 'Type', metadata.types)
    appendMetadataRow(technical, 'Conforms To', metadata.conformsTo)
    appendMetadataRow(
      technical,
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
    appendMetadataRow(technical, 'Access Modes', metadata.accessibilityModes)
    appendMetadataRow(technical, 'Accessibility', metadata.accessibilityFeatures)
    appendMetadataRow(technical, 'Access Hazards', metadata.accessibilityHazards)
    if (metadata.accessibilitySummary)
      technical.push({ label: 'Access Notes', value: metadata.accessibilitySummary })
    appendMetadataRow(
      technical,
      'Identifier',
      metadata.identifiers.length > 0 ? metadata.identifiers : [publication.id],
    )
  }
  else {
    technical.push({ label: 'Identifier', value: publication.id })
  }

  appendMetadataRow(technical, 'Format', formats)
  technical.push({ label: 'Book Source', value: sourceName })

  return {
    formats,
    headlineFacts: uniqueValues([
      ...formats,
      ...(metadata?.languages.map(formatLanguage) ?? []),
      sourceName,
    ]),
    information,
    summary: plainTextSummary(publication.summary),
    technical,
  }
}
