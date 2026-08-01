'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { Uploader } from 'prosekit/extensions/file'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'
import type { OutlineRuntime } from '../../common/outline-runtime'
import type { EditorAction } from '../editor-actions/index.ts'
import * as stylex from '@stylexjs/stylex'
import {
  Check,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Code2,
  Copy,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Scissors,
  Table2,
  TextSelect,
  X,
} from 'lucide-react'
import { AllSelection, TextSelection } from 'prosekit/pm/state'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { useTranslation } from 'react-i18next'
import { getEditorActions } from '../editor-actions/index.ts'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { ImageUploadForm } from '../image-upload-popover/index.ts'
import { contextMenuStyles } from './context-menu.stylex'
import { copySelection, cutSelection, pasteClipboard } from './editor-clipboard.ts'

interface Point {
  x: number
  y: number
}

function keepInViewport(element: HTMLElement, point: Point) {
  const edge = 8
  const rect = element.getBoundingClientRect()
  const left = Math.max(edge, Math.min(point.x, window.innerWidth - rect.width - edge))
  const top = Math.max(edge, Math.min(point.y, window.innerHeight - rect.height - edge))
  element.style.left = `${left}px`
  element.style.top = `${top}px`
}

function positionSubmenu(element: HTMLElement, trigger: HTMLElement) {
  const edge = 8
  const gap = 4
  const rect = element.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const right = triggerRect.right + gap
  const left = right + rect.width <= window.innerWidth - edge
    ? right
    : triggerRect.left - rect.width - gap
  const top = Math.max(edge, Math.min(triggerRect.top - 5, window.innerHeight - rect.height - edge))

  element.style.left = `${Math.max(edge, left)}px`
  element.style.top = `${top}px`
}

function getContextPoint(editor: Editor<BasicExtension>, event: MouseEvent): Point {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { x: event.clientX, y: event.clientY }
  }

  const coords = editor.view.coordsAtPos(editor.state.selection.from)
  return { x: coords.left, y: coords.bottom }
}

function blockIdAtPosition(editor: Editor<BasicExtension>, position: number): string | null {
  const $position = editor.state.doc.resolve(position)
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth)
    if (node.type.name !== 'list')
      continue
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The context menu Outline block is missing its stable id')
    return blockId
  }
  return null
}

function blockIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element))
    return null
  const block = target.closest<HTMLElement>('[data-block-id]')
  if (!block)
    return null
  const blockId = block.dataset.blockId
  if (!blockId)
    throw new Error('The context menu target block is missing its stable id')
  return blockId
}

function moveSelectionToContextPoint(editor: Editor<BasicExtension>, point: Point): string | null {
  const view = editor.view
  const result = view.posAtCoords({ left: point.x, top: point.y })
  if (!result)
    return null
  const blockId = blockIdAtPosition(editor, result.pos)

  const { selection } = view.state
  const clickIsInsideSelection = !selection.empty && result.pos >= selection.from && result.pos <= selection.to
  if (clickIsInsideSelection)
    return blockId

  const nextSelection = TextSelection.near(view.state.doc.resolve(result.pos))
  view.dispatch(view.state.tr.setSelection(nextSelection))
  return blockId
}

function runAction(editor: Editor<BasicExtension>, action: EditorAction, close: () => void) {
  action.run()
  close()
  editor.focus()
}

function ContextMenuItem(props: {
  action?: EditorAction
  buttonRef?: Ref<HTMLButtonElement>
  disabled?: boolean
  expanded?: boolean
  hasSubmenu?: boolean
  icon: ReactNode
  label: string
  open?: boolean
  onMouseEnter?: () => void
  onSelect?: () => void
  shortcut?: string
  trailing?: ReactNode
}) {
  const disabled = props.disabled ?? (props.action ? !props.action.canExec : false)
  const active = props.action?.active ?? false
  const handleClick = props.onSelect ?? props.action?.run

  if (!handleClick) {
    throw new Error(`Context menu item "${props.label}" requires an action`)
  }

  return (
    <button
      ref={props.buttonRef}
      {...stylex.props(
        contextMenuStyles.item,
        props.open && contextMenuStyles.itemOpen,
      )}
      aria-expanded={props.hasSubmenu ? props.expanded : undefined}
      aria-haspopup={props.hasSubmenu ? 'menu' : undefined}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={handleClick}
      onMouseEnter={props.onMouseEnter}
      onMouseDown={event => event.preventDefault()}
    >
      <span {...stylex.props(contextMenuStyles.itemLabel)}>
        <span {...stylex.props(contextMenuStyles.icon)}>{props.icon}</span>
        <span>{props.label}</span>
      </span>
      <span {...stylex.props(contextMenuStyles.trailing)}>
        {props.trailing
          ?? (active
            ? <Check aria-hidden="true" size={15} />
            : props.shortcut
              ? <span {...stylex.props(contextMenuStyles.shortcut)}>{props.shortcut}</span>
              : null)}
      </span>
    </button>
  )
}

function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
  if (items.length === 0)
    return

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | undefined

  if (event.key === 'ArrowDown')
    nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
  else if (event.key === 'ArrowUp')
    nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
  else if (event.key === 'Home')
    nextIndex = 0
  else if (event.key === 'End')
    nextIndex = items.length - 1

  if (nextIndex === undefined)
    return

  const nextItem = items[nextIndex]
  if (!nextItem)
    throw new Error(`Missing context menu item at index ${nextIndex}`)

  event.preventDefault()
  nextItem.focus()
}

function ImageInsertPanel({ point, uploader, onClose }: {
  point: Point
  uploader: Uploader<string>
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('editor')

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel)
      return
    keepInViewport(panel, point)
    panel.querySelector<HTMLInputElement>('input')?.focus()
  }, [point])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      {...stylex.props(contextMenuStyles.overlay)}
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <div
        ref={panelRef}
        {...stylex.props(
          floatingSurfaceStyles.surface,
          contextMenuStyles.imagePanel,
        )}
        aria-label={t('ui.insertImage')}
        aria-modal="false"
        role="dialog"
      >
        <div {...stylex.props(contextMenuStyles.imageHeader)}>
          <strong>{t('ui.insertImageTitle')}</strong>
          <button
            {...stylex.props(contextMenuStyles.imageClose)}
            aria-label={t('ui.closeImageMenu')}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <ImageUploadForm uploader={uploader} onComplete={onClose} />
      </div>
    </div>
  )
}

export default function ContextMenu({ outlineRuntime, uploader }: { outlineRuntime: OutlineRuntime, uploader: Uploader<string> }) {
  const editor = useEditor<BasicExtension>()
  const actions = useEditorDerivedValue(getEditorActions)
  const { t } = useTranslation('editor')
  const [menuPoint, setMenuPoint] = useState<Point | null>(null)
  const [imagePoint, setImagePoint] = useState<Point | null>(null)
  const [outlineBlockId, setOutlineBlockId] = useState<string | null>(null)
  const [styleMenuOpen, setStyleMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const styleTriggerRef = useRef<HTMLButtonElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const focusStyleMenuRef = useRef(false)

  const closeMenu = () => {
    setMenuPoint(null)
    setOutlineBlockId(null)
    setStyleMenuOpen(false)
  }
  const closeImagePanel = () => {
    setImagePoint(null)
    editor.focus()
  }
  const openStyleMenu = (focusFirstItem: boolean) => {
    focusStyleMenuRef.current = focusFirstItem
    setStyleMenuOpen(true)
  }
  const closeStyleMenu = () => {
    focusStyleMenuRef.current = false
    setStyleMenuOpen(false)
    styleTriggerRef.current?.focus()
  }
  const handleClipboardAction = (label: string, task: () => Promise<void>) => {
    closeMenu()
    void task()
      .catch(error => console.error(`[editor] ${label} failed`, error))
      .finally(() => editor.focus())
  }
  const handleMainMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' && document.activeElement === styleTriggerRef.current) {
      event.preventDefault()
      openStyleMenu(true)
      return
    }

    handleMenuKeyDown(event)
  }
  const handleStyleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeStyleMenu()
      return
    }

    handleMenuKeyDown(event)
  }
  const hasSelection = !editor.state.selection.empty
  const canReadClipboard = typeof navigator.clipboard?.read === 'function'
  const canWriteClipboard = typeof navigator.clipboard?.write === 'function'
    && typeof ClipboardItem !== 'undefined'
  const primaryModifier = navigator.userAgent.includes('Macintosh') ? '⌘' : 'Ctrl+'
  const outlineSnapshot = useSyncExternalStore(
    outlineRuntime.subscribe,
    outlineRuntime.getSnapshot,
    outlineRuntime.getSnapshot,
  )
  const outlineCollapseBlockIds = outlineBlockId && outlineSnapshot.active
    ? outlineSnapshot.selectedBlockIds.includes(outlineBlockId)
      ? outlineSnapshot.selectedBlockIds
      : [outlineBlockId]
    : []
  const shouldCollapseOutlineBlocks = outlineCollapseBlockIds.some(blockId => !outlineSnapshot.collapsedBlockIds.includes(blockId))

  useEffect(() => {
    const editorElement = editor.view.dom
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      const point = getContextPoint(editor, event)
      const targetBlockId = blockIdFromEventTarget(event.target)
      const selectedBlockId = moveSelectionToContextPoint(editor, point)
      setOutlineBlockId(targetBlockId ?? selectedBlockId)
      setImagePoint(null)
      setStyleMenuOpen(false)
      setMenuPoint(point)
    }

    editorElement.addEventListener('contextmenu', handleContextMenu)
    return () => editorElement.removeEventListener('contextmenu', handleContextMenu)
  }, [editor])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu || !menuPoint)
      return

    keepInViewport(menu, menuPoint)
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [menuPoint])

  useLayoutEffect(() => {
    const submenu = styleMenuRef.current
    const trigger = styleTriggerRef.current
    if (!styleMenuOpen || !submenu || !trigger)
      return

    positionSubmenu(submenu, trigger)
    if (focusStyleMenuRef.current) {
      focusStyleMenuRef.current = false
      submenu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    }
  }, [styleMenuOpen])

  useEffect(() => {
    if (!menuPoint)
      return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node
        && !menuRef.current?.contains(target)
        && !styleMenuRef.current?.contains(target)
      ) {
        closeMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (styleMenuOpen) {
          closeStyleMenu()
        }
        else {
          closeMenu()
          editor.focus()
        }
      }
      else if (event.key === 'Tab') {
        closeMenu()
      }
    }
    const handleViewportChange = () => closeMenu()

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [editor, menuPoint, styleMenuOpen])

  if (!menuPoint && !imagePoint)
    return null

  return createPortal(
    <>
      {menuPoint
        ? (
            <div
              ref={menuRef}
              {...stylex.props(floatingSurfaceStyles.surface, contextMenuStyles.popup)}
              aria-label={t('ui.editorActions')}
              role="menu"
              tabIndex={-1}
              onKeyDown={handleMainMenuKeyDown}
            >
              <ContextMenuItem
                disabled={!hasSelection || !canWriteClipboard}
                icon={<Scissors aria-hidden="true" size={16} />}
                label={t('ui.cut')}
                onMouseEnter={() => setStyleMenuOpen(false)}
                onSelect={() => handleClipboardAction('Cut', () => cutSelection(editor))}
                shortcut={`${primaryModifier}X`}
              />
              <ContextMenuItem
                disabled={!hasSelection || !canWriteClipboard}
                icon={<Copy aria-hidden="true" size={16} />}
                label={t('ui.copy')}
                onMouseEnter={() => setStyleMenuOpen(false)}
                onSelect={() => handleClipboardAction('Copy', () => copySelection(editor))}
                shortcut={`${primaryModifier}C`}
              />
              <ContextMenuItem
                disabled={!canReadClipboard}
                icon={<ClipboardPaste aria-hidden="true" size={16} />}
                label={t('ui.paste')}
                onMouseEnter={() => setStyleMenuOpen(false)}
                onSelect={() => handleClipboardAction('Paste', () => pasteClipboard(editor))}
                shortcut={`${primaryModifier}V`}
              />

              <div {...stylex.props(contextMenuStyles.separator)} role="separator" />

              <ContextMenuItem
                icon={<TextSelect aria-hidden="true" size={16} />}
                label={t('ui.selectAll')}
                onMouseEnter={() => setStyleMenuOpen(false)}
                onSelect={() => {
                  editor.view.dispatch(
                    editor.state.tr.setSelection(new AllSelection(editor.state.doc)),
                  )
                  closeMenu()
                  editor.focus()
                }}
                shortcut={`${primaryModifier}A`}
              />

              {outlineCollapseBlockIds.length > 0
                ? (
                    <>
                      <div {...stylex.props(contextMenuStyles.separator)} role="separator" />
                      <ContextMenuItem
                        icon={shouldCollapseOutlineBlocks
                          ? <ChevronsUp aria-hidden="true" size={16} />
                          : <ChevronsDown aria-hidden="true" size={16} />}
                        label={shouldCollapseOutlineBlocks ? t('ui.collapse') : t('ui.expand')}
                        onMouseEnter={() => setStyleMenuOpen(false)}
                        onSelect={() => {
                          outlineRuntime.toggleCollapsed(outlineCollapseBlockIds)
                          closeMenu()
                          editor.focus()
                        }}
                      />
                    </>
                  )
                : null}

              <div {...stylex.props(contextMenuStyles.separator)} role="separator" />

              <ContextMenuItem
                buttonRef={styleTriggerRef}
                expanded={styleMenuOpen}
                hasSubmenu
                icon={<Pilcrow aria-hidden="true" size={16} />}
                label={t('ui.style')}
                open={styleMenuOpen}
                onMouseEnter={() => openStyleMenu(false)}
                onSelect={() => openStyleMenu(true)}
                trailing={<ChevronRight aria-hidden="true" size={15} />}
              />

              {!hasSelection
                ? (
                    <>
                      <div {...stylex.props(contextMenuStyles.separator)} role="separator" />

                      <ContextMenuItem
                        action={actions.insert.table}
                        icon={<Table2 aria-hidden="true" size={16} />}
                        label={t('ui.insertTable')}
                        onMouseEnter={() => setStyleMenuOpen(false)}
                        onSelect={() => runAction(editor, actions.insert.table, closeMenu)}
                      />
                      <ContextMenuItem
                        action={actions.insert.divider}
                        icon={<Minus aria-hidden="true" size={16} />}
                        label={t('ui.insertDivider')}
                        onMouseEnter={() => setStyleMenuOpen(false)}
                        onSelect={() => runAction(editor, actions.insert.divider, closeMenu)}
                      />
                      <ContextMenuItem
                        disabled={!actions.insert.image.canExec}
                        icon={<ImagePlus aria-hidden="true" size={16} />}
                        label={t('ui.insertImageELLIPSIS')}
                        onMouseEnter={() => setStyleMenuOpen(false)}
                        onSelect={() => {
                          setImagePoint(menuPoint)
                          closeMenu()
                        }}
                      />
                    </>
                  )
                : null}
            </div>
          )
        : null}

      {menuPoint && styleMenuOpen
        ? (
            <div
              ref={styleMenuRef}
              {...stylex.props(
                floatingSurfaceStyles.surface,
                contextMenuStyles.popup,
                contextMenuStyles.submenuPopup,
              )}
              aria-label={t('ui.objectStyles')}
              role="menu"
              tabIndex={-1}
              onKeyDown={handleStyleMenuKeyDown}
            >
              <ContextMenuItem
                action={actions.block.bulletList}
                icon={<List aria-hidden="true" size={16} />}
                label={t('ui.bulletList')}
                onSelect={() => runAction(editor, actions.block.bulletList, closeMenu)}
              />
              <ContextMenuItem
                action={actions.block.orderedList}
                icon={<ListOrdered aria-hidden="true" size={16} />}
                label={t('ui.orderedList')}
                onSelect={() => runAction(editor, actions.block.orderedList, closeMenu)}
              />
              <ContextMenuItem
                action={actions.block.taskList}
                icon={<ListChecks aria-hidden="true" size={16} />}
                label={t('ui.taskList')}
                onSelect={() => runAction(editor, actions.block.taskList, closeMenu)}
              />
              <ContextMenuItem
                action={actions.block.toggleList}
                icon={<List aria-hidden="true" size={16} />}
                label={t('ui.toggleList')}
                onSelect={() => runAction(editor, actions.block.toggleList, closeMenu)}
              />

              <div {...stylex.props(contextMenuStyles.separator)} role="separator" />

              <ContextMenuItem
                action={actions.block.blockquote}
                icon={<Quote aria-hidden="true" size={16} />}
                label={t('ui.blockquote')}
                onSelect={() => runAction(editor, actions.block.blockquote, closeMenu)}
              />
              <ContextMenuItem
                action={actions.block.codeBlock}
                icon={<Code2 aria-hidden="true" size={16} />}
                label={t('ui.codeBlock')}
                onSelect={() => runAction(editor, actions.block.codeBlock, closeMenu)}
              />
            </div>
          )
        : null}

      {imagePoint
        ? <ImageInsertPanel point={imagePoint} uploader={uploader} onClose={closeImagePanel} />
        : null}
    </>,
    document.body,
  )
}
