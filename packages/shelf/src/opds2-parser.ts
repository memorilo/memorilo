import type {
  ShelfNavigationItem,
  ShelfPage,
  ShelfPublication,
  ShelfPublicationLink,
  ShelfPublicationMetadata,
} from './model'
import type { OpdsRecord } from './opds-parser-values'
import {
  asOpdsArray,
  asOpdsRecord,
  firstOpdsLink,
  normalizeOpdsCollections,
  normalizeOpdsContributorRoles,
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

function normalizeJsonLinks(value: unknown, baseUrl: string): readonly ShelfPublicationLink[] {
  return asOpdsArray(value).flatMap((candidate) => {
    const link = asOpdsRecord(candidate)
    if (link === null)
      return []
    const href = resolveOpdsHref(link.href, baseUrl)
    if (href === null)
      return []
    const relations = opdsRelationValues(link.rel)
    return [{ href, rel: relations.join(' '), type: optionalOpdsString(link.type) }]
  })
}

function normalizeJsonPublicationMetadata(metadata: OpdsRecord): ShelfPublicationMetadata {
  const belongsTo = asOpdsRecord(metadata.belongsTo)
  const accessibility = asOpdsRecord(metadata.accessibility)
  return {
    accessibilityFeatures: normalizeOpdsTextList(accessibility?.feature ?? metadata.accessibilityFeature),
    accessibilityHazards: normalizeOpdsTextList(accessibility?.hazard ?? metadata.accessibilityHazard),
    accessibilityModes: normalizeOpdsTextList(accessibility?.accessMode ?? metadata.accessMode),
    accessibilitySummary: opdsContentText(accessibility?.summary ?? metadata.accessibilitySummary),
    collections: belongsTo === null
      ? []
      : [
          ...normalizeOpdsCollections(belongsTo.series, 'series'),
          ...normalizeOpdsCollections(belongsTo.collection, 'collection'),
        ],
    conformsTo: normalizeOpdsTextList(metadata.conformsTo),
    contributors: normalizeOpdsContributorRoles(metadata),
    duration: optionalOpdsNonNegativeNumber(metadata.duration),
    identifiers: normalizeOpdsTextList(metadata.identifier),
    imprints: normalizeOpdsContributors(metadata.imprint),
    languages: normalizeOpdsTextList(metadata.language ?? metadata.languages),
    modified: opdsText(metadata.modified),
    numberOfPages: optionalOpdsNonNegativeNumber(metadata.numberOfPages),
    published: opdsText(metadata.published),
    publishers: normalizeOpdsContributors(metadata.publisher),
    readingProgression: optionalOpdsString(metadata.readingProgression),
    rights: opdsContentText(metadata.rights),
    subjects: normalizeOpdsSubjects(metadata.subject),
    types: normalizeOpdsTextList(metadata['@type'] ?? metadata.type),
  }
}

function publicationId(record: OpdsRecord, links: readonly ShelfPublicationLink[], title: string): string {
  const metadata = asOpdsRecord(record.metadata)
  return optionalOpdsString(metadata?.identifier) ?? firstOpdsLink(links, 'self') ?? `${title}\0${links[0]?.href ?? ''}`
}

function normalizeJsonPublication(value: unknown, baseUrl: string, section: string | null): ShelfPublication {
  const publication = asOpdsRecord(value)
  if (publication === null)
    throw new TypeError('OPDS publication must be an object')
  const metadata = asOpdsRecord(publication.metadata)
  if (metadata === null)
    throw new TypeError('OPDS publication is missing metadata')
  const title = requiredOpdsTitle(metadata.title, 'OPDS publication')
  const links = normalizeJsonLinks(publication.links, baseUrl)
  const images = normalizeJsonLinks(publication.images, baseUrl)
  const cover = preferredOpdsImage([...images, ...links]) ?? images[0]
  return {
    authors: normalizeOpdsContributors(metadata.author ?? metadata.authors),
    coverUrl: cover?.href ?? null,
    id: publicationId(publication, links, title),
    links,
    metadata: normalizeJsonPublicationMetadata(metadata),
    section,
    subtitle: optionalOpdsString(metadata.subtitle),
    summary: opdsSummary(metadata.description ?? metadata.summary),
    title,
  }
}

function normalizeJsonNavigation(value: unknown, baseUrl: string): ShelfNavigationItem {
  const item = asOpdsRecord(value)
  if (item === null)
    throw new TypeError('OPDS navigation item must be an object')
  const href = resolveOpdsHref(item.href, baseUrl)
  if (href === null)
    throw new TypeError('OPDS navigation item is missing an HTTP URL')
  return { href, subtitle: opdsText(item.description), title: requiredOpdsTitle(item.title, 'OPDS navigation item') }
}

export function parseOpds2(value: unknown, requestUrl: string): ShelfPage {
  const feed = asOpdsRecord(value)
  if (feed === null)
    throw new TypeError('OPDS feed must be a JSON object')
  const metadata = asOpdsRecord(feed.metadata)
  const title = requiredOpdsTitle(metadata?.title, 'OPDS feed')
  const links = normalizeJsonLinks(feed.links, requestUrl)
  const groups = asOpdsArray(feed.groups)
  const publications = [
    ...asOpdsArray(feed.publications).map(item => normalizeJsonPublication(item, requestUrl, null)),
    ...groups.flatMap((candidate) => {
      const group = asOpdsRecord(candidate)
      if (group === null)
        return []
      const section = opdsText(asOpdsRecord(group.metadata)?.title)
      return asOpdsArray(group.publications).map(item => normalizeJsonPublication(item, requestUrl, section))
    }),
  ]
  const navigation = [
    ...asOpdsArray(feed.navigation).map(item => normalizeJsonNavigation(item, requestUrl)),
    ...groups.flatMap((candidate) => {
      const group = asOpdsRecord(candidate)
      return group === null ? [] : asOpdsArray(group.navigation).map(item => normalizeJsonNavigation(item, requestUrl))
    }),
  ]
  return {
    nextUrl: firstOpdsLink(links, 'next'),
    navigation,
    publications,
    selfUrl: firstOpdsLink(links, 'self') ?? requestUrl,
    subtitle: opdsText(metadata?.subtitle ?? metadata?.description),
    title,
  }
}
