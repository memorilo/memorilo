import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating, useMergeRefs } from '@floating-ui/react'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, ChevronRight, CircleAlert, FileText, Folder, PenLine, Plus, RefreshCw, Table2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../../shared/desktop-requests'
import { floatingPointReference, floatingTransformOrigin } from '../../../shared/floating-ui'
import { useLatestOperations } from '../../../shared/lifecycle/owned-resource'
import { noteEntryContextMenuStyles } from './note-entry-context-menu.stylex'

interface EntryContextMenuBase {
  x: number
  y: number
}

interface ContainerEntryContextMenu extends EntryContextMenuBase {
  allowFolder: boolean
  kind: 'container'
  parentId: string | null
}

type BookResourceState = 'available' | 'checking' | 'error' | 'missing'

interface BookEntryContextMenu extends EntryContextMenuBase {
  kind: 'book'
  readingId: string
  resourceState: BookResourceState
  topicId: string
}

type EntryContextMenu = BookEntryContextMenu | ContainerEntryContextMenu

interface NoteEntryContextMenuActions {
  onAddBook: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onAddSpreadsheet: (parentId: string | null) => void
  onAddTopic: (parentId: string | null) => void
  onAddWhiteboard: (parentId: string | null) => void
  onRebindBook: (topicId: string) => void
}

interface NoteEntryContextMenuController {
  menu: ReactNode
  openBook: (event: ReactMouseEvent, topicId: string, readingId: string) => void
  openContainer: (event: ReactMouseEvent, parentId: string | null, allowFolder: boolean) => void
}

export function useNoteEntryContextMenu({
  onAddBook,
  onAddFolder,
  onAddSpreadsheet,
  onAddTopic,
  onAddWhiteboard,
  onRebindBook,
}: NoteEntryContextMenuActions): NoteEntryContextMenuController {
  const { t } = useTranslation('editor')
  const [addSubmenuOpen, setAddSubmenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<EntryContextMenu | null>(null)
  const addMenuFirstItemRef = useRef<HTMLButtonElement>(null)
  const addMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const availability = useLatestOperations<'availability'>('Book reading availability check', {
    concurrency: 'parallel',
  })
  const menuReference = useMemo(
    () => contextMenu ? floatingPointReference(contextMenu.x, contextMenu.y) : null,
    [contextMenu],
  )
  const mainFloating = useFloating({
    middleware: [flip({ padding: 8 }), shift({ padding: 8 })],
    open: contextMenu !== null,
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })
  const submenuFloating = useFloating({
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ],
    open: addSubmenuOpen,
    placement: 'right-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })
  const addMenuTriggerReference = useMergeRefs([
    addMenuTriggerRef,
    submenuFloating.refs.setReference,
  ])

  useLayoutEffect(() => {
    mainFloating.refs.setReference(menuReference)
  }, [mainFloating.refs, menuReference])

  const close = useCallback(() => {
    availability.invalidate('availability')
    setAddSubmenuOpen(false)
    setContextMenu(null)
  }, [availability])

  const openContainer = useCallback((
    event: ReactMouseEvent,
    parentId: string | null,
    allowFolder: boolean,
  ) => {
    event.preventDefault()
    availability.invalidate('availability')
    setAddSubmenuOpen(false)
    setContextMenu({ allowFolder, kind: 'container', parentId, x: event.clientX, y: event.clientY })
  }, [availability])

  const openBook = useCallback((event: ReactMouseEvent, topicId: string, readingId: string) => {
    event.preventDefault()
    setAddSubmenuOpen(false)
    setContextMenu({
      kind: 'book',
      readingId,
      resourceState: 'checking',
      topicId,
      x: event.clientX,
      y: event.clientY,
    })
    void availability.run(
      'availability',
      () => desktopRequests.isBookReadingAvailable(readingId),
    ).then(
      (result) => {
        if (result.status === 'superseded')
          return
        setContextMenu(current => current?.kind === 'book'
          && current.readingId === readingId
          && current.topicId === topicId
          ? { ...current, resourceState: result.value ? 'available' : 'missing' }
          : current)
      },
      (cause) => {
        console.error(`Failed to check reading file ${readingId}`, cause)
        setContextMenu(current => current?.kind === 'book'
          && current.readingId === readingId
          && current.topicId === topicId
          ? { ...current, resourceState: 'error' }
          : current)
      },
    )
  }, [availability])

  useEffect(() => {
    if (!contextMenu)
      return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [close, contextMenu])

  const menu = contextMenu
    ? (
        <FloatingPortal>
          <div
            ref={mainFloating.refs.setFloating}
            {...stylex.props(noteEntryContextMenuStyles.entryContextMenu)}
            role="menu"
            style={{
              ...mainFloating.floatingStyles,
              transformOrigin: floatingTransformOrigin(mainFloating.placement),
              visibility: mainFloating.isPositioned ? 'visible' : 'hidden',
            }}
            onContextMenu={event => event.preventDefault()}
            onPointerDown={event => event.stopPropagation()}
          >
            <div
              {...stylex.props(noteEntryContextMenuStyles.entryContextSubmenuTrigger)}
              onPointerEnter={() => setAddSubmenuOpen(true)}
            >
              <button
                ref={addMenuTriggerReference}
                {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                aria-expanded={addSubmenuOpen}
                aria-haspopup="menu"
                role="menuitem"
                type="button"
                onClick={() => setAddSubmenuOpen(true)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ')
                    return
                  event.preventDefault()
                  setAddSubmenuOpen(true)
                  queueMicrotask(() => addMenuFirstItemRef.current?.focus())
                }}
              >
                <Plus aria-hidden="true" size={14} strokeWidth={1.8} />
                {t('add')}
                <ChevronRight
                  {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItemTrailing)}
                  aria-hidden="true"
                  size={13}
                  strokeWidth={1.8}
                />
              </button>
              {addSubmenuOpen
                ? (
                    <FloatingPortal>
                      <div
                        ref={submenuFloating.refs.setFloating}
                        {...stylex.props(noteEntryContextMenuStyles.entryContextSubmenu)}
                        role="menu"
                        style={{
                          ...submenuFloating.floatingStyles,
                          transformOrigin: floatingTransformOrigin(submenuFloating.placement),
                          visibility: submenuFloating.isPositioned ? 'visible' : 'hidden',
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key !== 'ArrowLeft')
                            return
                          event.preventDefault()
                          setAddSubmenuOpen(false)
                          queueMicrotask(() => addMenuTriggerRef.current?.focus())
                        }}
                      >
                        <button
                          ref={addMenuFirstItemRef}
                          {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddTopic(contextMenu.kind === 'book' ? contextMenu.topicId : contextMenu.parentId)
                            close()
                          }}
                        >
                          <FileText aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('topic')}
                        </button>
                        <button
                          {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddWhiteboard(contextMenu.kind === 'book' ? contextMenu.topicId : contextMenu.parentId)
                            close()
                          }}
                        >
                          <PenLine aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('whiteboard')}
                        </button>
                        <button
                          {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddSpreadsheet(contextMenu.kind === 'book' ? contextMenu.topicId : contextMenu.parentId)
                            close()
                          }}
                        >
                          <Table2 aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('spreadsheet.label')}
                        </button>
                        {contextMenu.kind === 'container' && contextMenu.allowFolder
                          ? (
                              <button
                                {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                  onAddFolder(contextMenu.parentId)
                                  close()
                                }}
                              >
                                <Folder aria-hidden="true" size={14} strokeWidth={1.8} />
                                {t('folder')}
                              </button>
                            )
                          : null}
                        <button
                          {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddBook(contextMenu.kind === 'book' ? contextMenu.topicId : contextMenu.parentId)
                            close()
                          }}
                        >
                          <BookOpen aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('book')}
                        </button>
                      </div>
                    </FloatingPortal>
                  )
                : null}
            </div>
            {contextMenu.kind === 'book' && contextMenu.resourceState === 'missing'
              ? (
                  <button
                    {...stylex.props(noteEntryContextMenuStyles.entryContextMenuItem)}
                    role="menuitem"
                    type="button"
                    onFocus={() => setAddSubmenuOpen(false)}
                    onPointerEnter={() => setAddSubmenuOpen(false)}
                    onClick={() => {
                      onRebindBook(contextMenu.topicId)
                      close()
                    }}
                  >
                    <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
                    {t('rebindBook')}
                  </button>
                )
              : null}
            {contextMenu.kind === 'book'
              && (contextMenu.resourceState === 'checking' || contextMenu.resourceState === 'error')
              ? (
                  <button
                    {...stylex.props(
                      noteEntryContextMenuStyles.entryContextMenuItem,
                      noteEntryContextMenuStyles.entryContextMenuItemDisabled,
                    )}
                    aria-disabled="true"
                    disabled
                    role="menuitem"
                    type="button"
                  >
                    {contextMenu.resourceState === 'checking'
                      ? <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
                      : <CircleAlert aria-hidden="true" size={14} strokeWidth={1.8} />}
                    {contextMenu.resourceState === 'checking'
                      ? t('checkingBookAvailability')
                      : t('bookAvailabilityCheckFailed')}
                  </button>
                )
              : null}
          </div>
        </FloatingPortal>
      )
    : null

  return { menu, openBook, openContainer }
}
