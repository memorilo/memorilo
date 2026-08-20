import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { editableTitleStyles } from './editable-title.stylex'
import { Slot } from './slot'

export type EditableTitleSubmitResult = { error?: string } | void

interface EditableTitleContextValue {
  cancel: () => void
  commit: () => Promise<void>
  draft: string
  editing: boolean
  error: string | null
  inputRef: { current: HTMLInputElement | null }
  saving: boolean
  setDraft: (value: string) => void
  startEditing: () => void
  value: string
}

const EditableTitleContext = createContext<EditableTitleContextValue | null>(null)

function useEditableTitle(): EditableTitleContextValue {
  const context = use(EditableTitleContext)
  if (context === null)
    throw new Error('EditableTitle compound components must be rendered inside EditableTitle.Root')
  return context
}

export interface EditableTitleRootProps {
  children?: ReactNode
  getSubmitError?: (cause: unknown) => string
  onSubmit: (value: string) => Promise<EditableTitleSubmitResult> | EditableTitleSubmitResult
  validate?: (value: string) => string | null
  value: string
}

function EditableTitleRoot({ children, getSubmitError, onSubmit, validate, value }: EditableTitleRootProps) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  // External title updates must refresh the draft while the control is idle.
  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setDraft(value)
    }
  }, [editing, value])

  useLayoutEffect(() => {
    if (!editing)
      return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEditing = useCallback(() => {
    if (savingRef.current)
      return
    setError(null)
    setDraft(value)
    setEditing(true)
  }, [value])
  const updateDraft = useCallback((nextValue: string) => {
    setDraft(nextValue)
    if (nextValue.trim().length > 0)
      setError(null)
  }, [])
  const cancel = useCallback(() => {
    if (savingRef.current)
      return
    setDraft(value)
    setError(null)
    setEditing(false)
  }, [value])
  const commit = useCallback(async () => {
    if (savingRef.current)
      return
    const normalized = draft.trim()
    const validationError = validate?.(normalized)
    if (validationError) {
      setError(validationError)
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }
    if (normalized === value) {
      setDraft(normalized)
      setError(null)
      setEditing(false)
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await onSubmit(normalized)
      if (result?.error) {
        setError(result.error)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
        return
      }
      setDraft(normalized)
      setEditing(false)
    }
    catch (cause) {
      setError(getSubmitError?.(cause) ?? (cause instanceof Error ? cause.message : String(cause)))
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [draft, getSubmitError, onSubmit, validate, value])
  const context = useMemo<EditableTitleContextValue>(() => ({
    cancel,
    commit,
    draft,
    editing,
    error,
    inputRef,
    saving,
    setDraft: updateDraft,
    startEditing,
    value,
  }), [cancel, commit, draft, editing, error, saving, startEditing, updateDraft, value])

  return <EditableTitleContext value={context}>{children}</EditableTitleContext>
}

function EditableTitleTrigger({ asChild = false, children, xstyle, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  const context = useEditableTitle()
  if (context.editing)
    return null
  const triggerProps = {
    ...props,
    'data-ui': 'editable-title-trigger',
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        context.startEditing()
    },
    'type': 'button' as const,
  }
  const styles = stylexRuntime.props(editableTitleStyles.trigger, xstyle)
  return asChild
    ? <Slot {...triggerProps} {...styles}>{children}</Slot>
    : <button {...triggerProps} {...styles} type="button">{children}</button>
}

function EditableTitleText({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  useEditableTitle()
  return <span {...props} {...stylexRuntime.props(editableTitleStyles.text, xstyle)} data-ui="editable-title-text">{children}</span>
}

function EditableTitleIcon({ asChild = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & { asChild?: boolean, children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  useEditableTitle()
  const styles = stylexRuntime.props(editableTitleStyles.icon, xstyle)
  return asChild
    ? <Slot {...props} {...styles}>{children}</Slot>
    : <span {...props} {...styles} data-ui="editable-title-icon">{children}</span>
}

function EditableTitleInput({ asChild = false, xstyle, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style' | 'value'> & {
  asChild?: boolean
  xstyle?: stylex.StyleXStyles
}) {
  const context = useEditableTitle()
  if (!context.editing)
    return null
  const inputProps = {
    ...props,
    'aria-busy': context.saving || undefined,
    'aria-invalid': context.error !== null || props['aria-invalid'] || undefined,
    'aria-label': context.error ?? props['aria-label'],
    'data-ui': 'editable-title-input',
    'onBlur': (event: React.FocusEvent<HTMLInputElement>) => {
      props.onBlur?.(event)
      if (event.defaultPrevented || context.saving)
        return
      if (context.draft.trim().length === 0)
        context.cancel()
      else
        void context.commit()
    },
    'onChange': (event: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(event)
      context.setDraft(event.target.value)
    },
    'onKeyDown': (event: React.KeyboardEvent<HTMLInputElement>) => {
      props.onKeyDown?.(event)
      if (event.defaultPrevented)
        return
      if (event.key === 'Enter') {
        event.preventDefault()
        void context.commit()
      }
      else if (event.key === 'Escape') {
        event.preventDefault()
        context.cancel()
      }
    },
    'readOnly': context.saving || props.readOnly,
    'ref': context.inputRef,
    'required': true,
    'value': context.draft,
  }
  const styles = stylexRuntime.props(editableTitleStyles.input, xstyle)
  return asChild
    ? <Slot {...inputProps} {...styles}>{props.children}</Slot>
    : <input {...inputProps} {...styles} />
}

function EditableTitleError({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  const context = useEditableTitle()
  if (!context.error)
    return null
  return <span {...props} {...stylexRuntime.props(editableTitleStyles.error, xstyle)} data-ui="editable-title-error" role="status">{children ?? context.error}</span>
}

export const EditableTitle = {
  Error: EditableTitleError,
  Icon: EditableTitleIcon,
  Input: EditableTitleInput,
  Root: EditableTitleRoot,
  Text: EditableTitleText,
  Trigger: EditableTitleTrigger,
}
