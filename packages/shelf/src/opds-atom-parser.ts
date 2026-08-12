import type {
  ShelfNavigationItem,
  ShelfPage,
  ShelfPublication,
  ShelfPublicationLink,
  ShelfPublicationMetadata,
} from './model'
import type { OpdsRecord } from './opds-parser-values'
import { XMLParser } from 'fast-xml-parser'
import {
  asOpdsArray,
  asOpdsRecord,
  firstOpdsLink,
  normalizeOpdsCollections,
  normalizeOpdsContributors,
  normalizeOpdsSubjects,
  normalizeOpdsTextList,
  opdsContentText,
  opdsRelationValues,
  opdsSummary,
  opdsText,
  optionalOpdsNonNegativeNumber,
  optionalOpdsString,
  preferredOpdsImage,
  requiredOpdsTitle,
  resolveOpdsHref,
} from './opds-parser-values'

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: '#text',
})

function normalizeAtomPublicationMetadata(entry: OpdsRecord): ShelfPublicationMetadata {
  return {
    accessibilityFeatures: normalizeOpdsTextList(entry.accessibilityFeature),
    accessibilityHazards: normalizeOpdsTextList(entry.accessibilityHazard),
    accessibilityModes: normalizeOpdsTextList(entry.accessMode),
    accessibilitySummary: opdsContentText(entry.accessibilitySummary),
    collections: [
      ...normalizeOpdsCollections(entry.series, 'series', entry.series_index),
      ...normalizeOpdsCollections(entry.collection, 'collection', entry.collection_index),
    ],
    conformsTo: normalizeOpdsTextList(entry.conformsTo),
    contributors: normalizeOpdsContributors(entry.contributor).map(name => ({ name, role: 'contributor' })),
    duration: optionalOpdsNonNegativeNumber(entry.duration),
    identifiers: normalizeOpdsTextList(entry.identifier ?? entry.id),
    imprints: normalizeOpdsContributors(entry.imprint),
    languages: normalizeOpdsTextList(entry.language),
    modified: opdsText(entry.updated),
    numberOfPages: optionalOpdsNonNegativeNumber(entry.numberOfPages ?? entry.extent),
    published: opdsText(entry.published ?? entry.issued),
    publishers: normalizeOpdsContributors(entry.publisher),
    readingProgression: optionalOpdsString(entry.readingProgression),
    rights: opdsContentText(entry.rights),
    subjects: normalizeOpdsSubjects(entry.category ?? entry.subject),
    types: normalizeOpdsTextList(entry.type),
  }
}

function normalizeAtomLinks(value: unknown, baseUrl: string): readonly ShelfPublicationLink[] {
  return asOpdsArray(value).flatMap((candidate) => {
    const link = asOpdsRecord(candidate)
    if (link === null)
      return []
    const href = resolveOpdsHref(link['@_href'], baseUrl)
    if (href === null)
      return []
    return [{
      href,
      rel: optionalOpdsString(link['@_rel']) ?? 'alternate',
      type: optionalOpdsString(link['@_type']),
    }]
  })
}

export function parseOpdsAtom(value: string, requestUrl: string): ShelfPage {
  const document = asOpdsRecord(xmlParser.parse(value))
  const feed = asOpdsRecord(document?.feed)
  if (feed === null)
    throw new TypeError('OPDS Atom document is missing a feed element')
  const feedLinks = normalizeAtomLinks(feed.link, requestUrl)
  const publications: ShelfPublication[] = []
  const navigation: ShelfNavigationItem[] = []
  for (const candidate of asOpdsArray(feed.entry)) {
    const entry = asOpdsRecord(candidate)
    if (entry === null)
      continue
    const title = requiredOpdsTitle(entry.title, 'OPDS Atom entry')
    const links = normalizeAtomLinks(entry.link, requestUrl)
    const acquisition = links.some(link => (
      opdsRelationValues(link.rel).some(relation => relation.startsWith('http://opds-spec.org/acquisition'))
    ))
    if (!acquisition) {
      const href = firstOpdsLink(links, 'subsection') ?? firstOpdsLink(links, 'alternate')
      if (href !== null)
        navigation.push({ href, subtitle: opdsText(entry.summary ?? entry.content), title })
      continue
    }
    const authors = asOpdsArray(entry.author).flatMap((author) => {
      const record = asOpdsRecord(author)
      const name = record ? opdsText(record.name) : null
      return name === null ? [] : [name]
    })
    const cover = preferredOpdsImage(links)
    publications.push({
      authors,
      coverUrl: cover?.href ?? null,
      id: opdsText(entry.id) ?? firstOpdsLink(links, 'alternate') ?? `${title}\0${links[0]?.href ?? ''}`,
      links,
      metadata: normalizeAtomPublicationMetadata(entry),
      section: null,
      subtitle: null,
      summary: opdsSummary(entry.summary ?? entry.content),
      title,
    })
  }
  return {
    nextUrl: firstOpdsLink(feedLinks, 'next'),
    navigation,
    publications,
    selfUrl: firstOpdsLink(feedLinks, 'self') ?? requestUrl,
    subtitle: opdsText(feed.subtitle),
    title: requiredOpdsTitle(feed.title, 'OPDS Atom feed'),
  }
}
