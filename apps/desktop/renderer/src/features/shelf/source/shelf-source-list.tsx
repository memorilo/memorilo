import type { ShelfSource } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { Globe2, Plus, Settings2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shelfSharedStyles } from '../shelf-shared.stylex'
import { shelfSourceManagerStyles } from './shelf-source-manager-sheet.stylex'

export function ShelfSourceList({
  onAdd,
  onEdit,
  onRemove,
  sources,
}: {
  onAdd: () => void
  onEdit: (source: ShelfSource) => void
  onRemove: (source: ShelfSource) => void
  sources: readonly ShelfSource[]
}) {
  const { t } = useTranslation('app')

  return (
    <div {...stylex.props(shelfSourceManagerStyles.managerBody)}>
      <div {...stylex.props(shelfSourceManagerStyles.managerList)}>
        {sources.map(source => (
          <div key={source.id} {...stylex.props(shelfSourceManagerStyles.managerSourceRow)}>
            <span {...stylex.props(shelfSourceManagerStyles.managerSourceIcon)} aria-hidden="true">
              <Globe2 size={17} strokeWidth={1.8} />
            </span>
            <button
              {...stylex.props(shelfSourceManagerStyles.managerSourceDetails)}
              type="button"
              onClick={() => onEdit(source)}
            >
              <strong>{source.name}</strong>
              <span>{source.username ? `${new URL(source.url).host}  -  ${source.username}` : new URL(source.url).host}</span>
            </button>
            <button
              {...stylex.props(shelfSharedStyles.iconButton)}
              aria-label={t('shelfEditSourceFor', { name: source.name })}
              title={t('shelfEditSourceFor', { name: source.name })}
              type="button"
              onClick={() => onEdit(source)}
            >
              <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              {...stylex.props(shelfSourceManagerStyles.managerRemoveButton)}
              aria-label={t('shelfRemoveSourceFor', { name: source.name })}
              title={t('shelfRemoveSourceFor', { name: source.name })}
              type="button"
              onClick={() => onRemove(source)}
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <footer {...stylex.props(shelfSourceManagerStyles.managerActions)}>
        <button {...stylex.props(shelfSharedStyles.primaryButton)} type="button" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
          {t('shelfAddBookSource')}
        </button>
      </footer>
    </div>
  )
}
