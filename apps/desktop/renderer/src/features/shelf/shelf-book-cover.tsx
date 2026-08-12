import type { ShelfPublication } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shelfBookCoverStyles as styles } from './shelf-book-cover.stylex'
import { shelfBookShellStyles } from './shelf-book-shell.stylex'
import { useShelfCover } from './shelf-cover'

export function ShelfBookCover({ publication, sourceId }: { publication: ShelfPublication, sourceId: string }) {
  const { t } = useTranslation('app')
  const cover = useShelfCover(sourceId, publication.coverUrl, true)
  const statusLabel = cover.state === 'loading'
    ? t('shelfLoadingCoverFor', { title: publication.title })
    : cover.state === 'error'
      ? t('shelfCoverUnavailableFor', { title: publication.title })
      : cover.state === 'missing'
        ? t('shelfNoCoverFor', { title: publication.title })
        : t('shelfCoverFor', { title: publication.title })

  return (
    <div
      {...stylex.props(styles.coverFrame)}
      aria-busy={cover.state === 'loading'}
      aria-label={statusLabel}
      role={cover.state === 'loading' || cover.state === 'error' ? 'status' : 'img'}
    >
      {cover.state === 'loaded' && cover.imageUrl
        ? <img {...stylex.props(styles.coverImage)} alt="" decoding="async" height={406} src={cover.imageUrl} width={280} />
        : (
            <div
              {...stylex.props(
                styles.coverPlaceholder,
                cover.state === 'loading' && styles.coverPlaceholderLoading,
                cover.state === 'error' && styles.coverPlaceholderError,
              )}
              aria-hidden="true"
            >
              {cover.state === 'loading'
                ? <LoaderCircle {...stylex.props(shelfBookShellStyles.spinner)} size={25} strokeWidth={1.45} />
                : cover.state === 'error'
                  ? <AlertCircle size={25} strokeWidth={1.45} />
                  : <BookOpen size={25} strokeWidth={1.35} />}
              <span {...stylex.props(styles.placeholderTitle)}>{publication.title}</span>
            </div>
          )}
    </div>
  )
}
