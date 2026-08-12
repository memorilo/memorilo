import type { DesktopBookTopicContextSummary } from '@memorilo/desktop-preload'
import * as stylex from '@stylexjs/stylex'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { readerContextDialogStyles } from './reader-context-dialogs.stylex'

export interface BookTitleDraft {
  noteTitle: string
  topicTitle: string
}

export function DuplicateTitleToast({
  onEdit,
  t,
}: {
  onEdit: () => void
  t: (key: string) => string
}) {
  return (
    <div>
      <span>{t('reader.duplicateTitle')}</span>
      <button type="button" onClick={onEdit}>{t('reader.edit')}</button>
    </div>
  )
}

export function ContextChoiceDialog({
  bookTitle,
  contexts,
  creating,
  onCreate,
  onSelect,
}: {
  bookTitle: string
  contexts: readonly DesktopBookTopicContextSummary[]
  creating: boolean
  onCreate: () => void
  onSelect: (context: DesktopBookTopicContextSummary) => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerContextDialogStyles.contextOverlay)}>
      <section
        {...stylex.props(readerContextDialogStyles.contextDialog)}
        aria-describedby="reader-context-description"
        aria-labelledby="reader-context-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerContextDialogStyles.contextHeader)}>
          <h1 id="reader-context-title" {...stylex.props(readerContextDialogStyles.contextTitle)}>{t('reader.chooseContext')}</h1>
          <p id="reader-context-description" {...stylex.props(readerContextDialogStyles.contextDescription)}>
            {t('reader.chooseContextDescription', { title: bookTitle })}
          </p>
        </header>
        <div {...stylex.props(readerContextDialogStyles.contextBody)}>
          {contexts.map(context => (
            <button
              key={`${context.noteId}:${context.topicId}`}
              {...stylex.props(readerContextDialogStyles.contextOption)}
              disabled={creating}
              type="button"
              onClick={() => onSelect(context)}
            >
              <span {...stylex.props(readerContextDialogStyles.contextOptionText)}>
                <span {...stylex.props(readerContextDialogStyles.contextOptionTitle)}>{context.noteTitle}</span>
                <span {...stylex.props(readerContextDialogStyles.contextOptionDetail)}>{context.topicTitle}</span>
              </span>
              <span {...stylex.props(readerContextDialogStyles.contextOptionFormat)}>{context.book.file.format}</span>
            </button>
          ))}
          <button
            {...stylex.props(readerContextDialogStyles.contextCreateButton)}
            disabled={creating}
            type="button"
            onClick={onCreate}
          >
            <Plus aria-hidden="true" size={15} strokeWidth={2} />
            {t('reader.createContext')}
          </button>
        </div>
      </section>
    </div>
  )
}

export function CreateBookDialog({
  creating,
  draft,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  creating: boolean
  draft: BookTitleDraft
  error: string | null
  onCancel: () => void
  onChange: (field: keyof BookTitleDraft, value: string) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerContextDialogStyles.contextOverlay)}>
      <section
        {...stylex.props(readerContextDialogStyles.contextDialog)}
        aria-describedby="reader-create-description"
        aria-labelledby="reader-create-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerContextDialogStyles.contextHeader)}>
          <h1 id="reader-create-title" {...stylex.props(readerContextDialogStyles.contextTitle)}>{t('reader.createContext')}</h1>
          <p id="reader-create-description" {...stylex.props(readerContextDialogStyles.contextDescription)}>
            {t('reader.createContextDescription')}
          </p>
        </header>
        <form
          {...stylex.props(readerContextDialogStyles.contextForm)}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <label {...stylex.props(readerContextDialogStyles.contextField)}>
            <span {...stylex.props(readerContextDialogStyles.contextLabel)}>{t('reader.noteTitle')}</span>
            <input
              {...stylex.props(readerContextDialogStyles.contextInput)}
              autoFocus
              disabled={creating}
              value={draft.noteTitle}
              onChange={event => onChange('noteTitle', event.target.value)}
            />
          </label>
          <label {...stylex.props(readerContextDialogStyles.contextField)}>
            <span {...stylex.props(readerContextDialogStyles.contextLabel)}>{t('reader.bookTopicTitle')}</span>
            <input
              {...stylex.props(readerContextDialogStyles.contextInput)}
              disabled={creating}
              value={draft.topicTitle}
              onChange={event => onChange('topicTitle', event.target.value)}
            />
          </label>
          {error
            ? <p {...stylex.props(readerContextDialogStyles.contextError)} role="alert">{error}</p>
            : null}
          <footer {...stylex.props(readerContextDialogStyles.contextFooter)}>
            <button
              {...stylex.props(readerContextDialogStyles.contextCancelButton)}
              disabled={creating}
              type="button"
              onClick={onCancel}
            >
              {t('reader.cancel')}
            </button>
            <button
              {...stylex.props(readerContextDialogStyles.contextCreateButton)}
              disabled={creating || draft.noteTitle.trim().length === 0 || draft.topicTitle.trim().length === 0}
              type="submit"
            >
              {creating ? t('reader.creatingContext') : t('reader.createContext')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export function ConfirmRebindDialog({
  creating,
  onCancel,
  onConfirm,
}: {
  creating: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerContextDialogStyles.contextOverlay)}>
      <section
        {...stylex.props(readerContextDialogStyles.contextDialog)}
        aria-describedby="reader-rebind-description"
        aria-labelledby="reader-rebind-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerContextDialogStyles.contextHeader)}>
          <h1 id="reader-rebind-title" {...stylex.props(readerContextDialogStyles.contextTitle)}>{t('reader.rebindTitle')}</h1>
          <p id="reader-rebind-description" {...stylex.props(readerContextDialogStyles.contextDescription)}>
            {t('reader.rebindWarning')}
          </p>
        </header>
        <footer {...stylex.props(readerContextDialogStyles.contextFooter)}>
          <button
            {...stylex.props(readerContextDialogStyles.contextCancelButton)}
            disabled={creating}
            type="button"
            onClick={onCancel}
          >
            {t('reader.cancel')}
          </button>
          <button
            {...stylex.props(readerContextDialogStyles.contextCreateButton)}
            disabled={creating}
            type="button"
            onClick={onConfirm}
          >
            {creating ? t('reader.rebinding') : t('reader.rebindAnyway')}
          </button>
        </footer>
      </section>
    </div>
  )
}
