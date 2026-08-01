'use client'

import type { ReactNodeViewProps } from 'prosekit/react'
import type { TagAttrs } from '../../extension/tag-extension'
import type { TagEditEntry, TagRuntime } from '../../tag/tag-runtime'
import * as stylex from '@stylexjs/stylex'
import { TextSelection } from 'prosekit/pm/state'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import { useTranslation } from 'react-i18next'
import { getTagLabelError, normalizeTagLabel, TAG_LABEL_ERROR_TRANSLATION_KEYS } from '../../tag/tag-label'
import { updateTagInDocument } from './tag-document'
import { tagViewStyles } from './tag-view.stylex'

export interface TagViewProps extends ReactNodeViewProps {
  runtime: TagRuntime
}

export default function TagView(props: TagViewProps) {
  const tag = props.node.attrs as TagAttrs
  const { getPos, runtime, view } = props
  const { t } = useTranslation('editor')
  const operation = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot(tag.id),
    () => runtime.getSnapshot(tag.id),
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tag.label)
  const [editEntry, setEditEntry] = useState<TagEditEntry | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const ignoreBlurRef = useRef(false)
  const canonicalTag = operation.status === 'saved' ? operation.canonicalTag : null

  const startEditing = useCallback((entry: TagEditEntry | null) => {
    ignoreBlurRef.current = false
    setDraft(tag.label)
    setEditEntry(entry)
    setValidationError(null)
    setEditing(true)
  }, [tag.label])

  useEffect(() => {
    if (!canonicalTag)
      return

    let active = true
    queueMicrotask(() => {
      if (active)
        updateTagInDocument(view, tag.id, canonicalTag)
    })
    return () => {
      active = false
    }
  }, [canonicalTag, view, tag.id])

  useEffect(() => {
    return runtime.subscribeEditing(() => {
      const currentPosition = getPos()
      return typeof currentPosition === 'number' ? currentPosition : undefined
    }, startEditing)
  }, [getPos, runtime, startEditing])

  useLayoutEffect(() => {
    if (!editing || !editEntry || !inputRef.current)
      return
    const offset = editEntry === 'start' ? 0 : inputRef.current.value.length
    inputRef.current.focus()
    inputRef.current.setSelectionRange(offset, offset)
    setEditEntry(null)
  }, [editEntry, editing])

  const beginEditing = (event: React.MouseEvent) => {
    event.preventDefault()
    startEditing(null)
  }

  const cancelEditing = () => {
    ignoreBlurRef.current = true
    setDraft(tag.label)
    setEditEntry(null)
    setValidationError(null)
    setEditing(false)
    view.focus()
  }

  const commitEditing = (focusEditor = true) => {
    const label = normalizeTagLabel(draft)
    const error = getTagLabelError(label)
    if (error) {
      setValidationError(t(TAG_LABEL_ERROR_TRANSLATION_KEYS[error], { count: 64 }))
      queueMicrotask(() => inputRef.current?.focus())
      return false
    }

    if (label !== tag.label || operation.status === 'error') {
      const updatedTag = { id: tag.id, label }
      updateTagInDocument(view, tag.id, updatedTag)
      runtime.save(updatedTag)
    }
    ignoreBlurRef.current = true
    setEditEntry(null)
    setValidationError(null)
    setEditing(false)
    if (focusEditor)
      view.focus()
    return true
  }

  const exitEditing = (direction: -1 | 1) => {
    if (!commitEditing(false))
      return
    const currentPosition = getPos()
    if (typeof currentPosition !== 'number')
      return
    const target = direction === -1 ? currentPosition : currentPosition + props.node.nodeSize
    const selection = TextSelection.create(view.state.doc, target)
    view.dispatch(view.state.tr.setSelection(selection))
    queueMicrotask(() => view.focus())
  }

  if (editing) {
    return (
      <span
        contentEditable={false}
        data-tag-interactive=""
        title={validationError ?? undefined}
        {...stylex.props(tagViewStyles.editor, Boolean(validationError) && tagViewStyles.error)}
      >
        <span aria-hidden="true">#</span>
        <input
          ref={inputRef}
          autoFocus
          aria-invalid={Boolean(validationError)}
          aria-label={t('ui.editTag', { label: tag.label })}
          disabled={operation.status === 'saving'}
          size={Math.max(2, Math.min(draft.length, 24))}
          value={draft}
          {...stylex.props(tagViewStyles.input)}
          onBlur={() => {
            if (ignoreBlurRef.current)
              return
            commitEditing(false)
          }}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={(event) => {
            const atStart = event.currentTarget.selectionStart === 0
              && event.currentTarget.selectionEnd === 0
            const atEnd = event.currentTarget.selectionStart === event.currentTarget.value.length
              && event.currentTarget.selectionEnd === event.currentTarget.value.length

            if (event.key === 'ArrowLeft' && atStart) {
              event.preventDefault()
              exitEditing(-1)
            }
            else if (event.key === 'ArrowRight' && atEnd) {
              event.preventDefault()
              exitEditing(1)
            }
            else if (event.key === 'Enter') {
              event.preventDefault()
              commitEditing()
            }
            else if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditing()
            }
          }}
        />
      </span>
    )
  }

  const hasError = operation.status === 'error'
  const statusText = operation.status === 'saving' ? t('ui.saving') : hasError ? t('ui.notSaved') : ''
  const operationError = hasError && typeof operation.error !== 'string'
    ? t(TAG_LABEL_ERROR_TRANSLATION_KEYS[operation.error.tagLabelError], { count: 64 })
    : hasError ? operation.error : ''
  const title = hasError ? t('ui.editTagErrorTitle', { message: operationError }) : t('ui.editTagTitle', { label: tag.label })

  return (
    <button
      type="button"
      aria-label={statusText ? t('ui.editTagStatus', { label: tag.label, status: statusText }) : t('ui.editTag', { label: tag.label })}
      contentEditable={false}
      data-tag-interactive=""
      title={title}
      {...stylex.props(
        tagViewStyles.control,
        props.selected && tagViewStyles.selected,
        operation.status === 'saving' && tagViewStyles.saving,
        hasError && tagViewStyles.error,
      )}
      onClick={beginEditing}
      onMouseDown={event => event.preventDefault()}
    >
      #
      {tag.label}
      {statusText
        ? <span aria-hidden="true" {...stylex.props(tagViewStyles.status)}>{hasError ? '!' : '…'}</span>
        : null}
    </button>
  )
}
