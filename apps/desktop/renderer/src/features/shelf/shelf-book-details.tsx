import type { ShelfBookMetadataProjection } from './shelf-book-metadata'
import * as stylex from '@stylexjs/stylex'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shelfBookDetailsStyles as styles } from './shelf-book-details.stylex'

export function ShelfBookDetails({ metadata }: { metadata: ShelfBookMetadataProjection }) {
  const { t } = useTranslation('app')
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false)

  return (
    <>
      <section {...stylex.props(styles.description)} aria-labelledby="book-description-title">
        <h2 id="book-description-title" {...stylex.props(styles.sectionTitle)}>{t('shelfDescription')}</h2>
        {metadata.summary
          ? <p {...stylex.props(styles.descriptionText)}>{metadata.summary}</p>
          : <p {...stylex.props(styles.descriptionUnavailable)}>{t('shelfNoDescription')}</p>}
      </section>
      {metadata.information.length > 0
        ? (
            <section {...stylex.props(styles.metadataInspector)} aria-labelledby="book-information-title">
              <h2 id="book-information-title" {...stylex.props(styles.inspectorTitle)}>{t('shelfInformation')}</h2>
              <dl {...stylex.props(styles.metadataGrid)}>
                {metadata.information.map(row => (
                  <div key={`${row.label}:${row.value}`} {...stylex.props(styles.metadataItem)}>
                    <dt {...stylex.props(styles.metadataTerm)}>{row.label}</dt>
                    <dd {...stylex.props(styles.metadataValue)}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        : null}
      <section {...stylex.props(styles.technicalSection)} aria-labelledby="book-technical-title">
        <button
          {...stylex.props(styles.disclosureButton)}
          aria-controls="book-technical-metadata"
          aria-expanded={technicalDetailsOpen}
          id="book-technical-title"
          type="button"
          onClick={() => setTechnicalDetailsOpen(open => !open)}
        >
          <ChevronRight
            {...stylex.props(styles.disclosureIcon, technicalDetailsOpen && styles.disclosureIconOpen)}
            aria-hidden="true"
            size={15}
            strokeWidth={1.8}
          />
          <span>{t('shelfTechnicalDetails')}</span>
        </button>
        {technicalDetailsOpen
          ? (
              <dl id="book-technical-metadata" {...stylex.props(styles.technicalMetadata)}>
                {metadata.technical.map(row => (
                  <div key={`${row.label}:${row.value}`} {...stylex.props(styles.technicalRow)}>
                    <dt {...stylex.props(styles.metadataTerm)}>{row.label}</dt>
                    <dd {...stylex.props(styles.metadataValue)}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )
          : null}
      </section>
    </>
  )
}
