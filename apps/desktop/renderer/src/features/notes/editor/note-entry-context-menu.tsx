import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, ChevronRight, CircleAlert, FileText, Folder, PenLine, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
      () => window.desktop.isBookReadingAvailable(readingId),
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

  const layout = useMemo(() => {
    if (!contextMenu)
      return null
    const viewportInset = 8
    const menuWidth = 168
    const menuGap = 4
    const menuPadding = 8
    const menuItemHeight = 30
    const mainItemCount = contextMenu.kind === 'book' && contextMenu.resourceState !== 'available' ? 2 : 1
    const submenuItemCount = contextMenu.kind === 'container' && contextMenu.allowFolder ? 4 : 3
    const requiredHeight = Math.max(
      menuPadding + mainItemCount * menuItemHeight,
      menuPadding + submenuItemCount * menuItemHeight,
    )
    const left = Math.max(
      viewportInset,
      Math.min(contextMenu.x, Math.max(viewportInset, window.innerWidth - menuWidth - viewportInset)),
    )
    const top = Math.max(
      viewportInset,
      Math.min(contextMenu.y, Math.max(viewportInset, window.innerHeight - requiredHeight - viewportInset)),
    )
    return {
      left,
      submenuOpensLeft: left + menuWidth + menuGap + menuWidth > window.innerWidth - viewportInset,
      top,
    }
  }, [contextMenu])

  const menu = contextMenu && layout
    ? (
        <div
          {...stylex.props(noteEntryContextMenuStyles.entryContextMenu)}
          role="menu"
          style={{ left: layout.left, top: layout.top }}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div
            {...stylex.props(noteEntryContextMenuStyles.entryContextSubmenuTrigger)}
            onPointerEnter={() => setAddSubmenuOpen(true)}
          >
            <button
              ref={addMenuTriggerRef}
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
                  <div
                    {...stylex.props(
                      noteEntryContextMenuStyles.entryContextSubmenu,
                      layout.submenuOpensLeft && noteEntryContextMenuStyles.entryContextSubmenuLeft,
                    )}
                    role="menu"
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
      )
    : null

  return { menu, openBook, openContainer }
}
