import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  BookTopicSnapshot,
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
  NoteEntrySnapshot,
} from '@memorilo/editor'
import type { ShelfPublication, ShelfReadingFormat, ShelfSource } from '@memorilo/shelf'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { PaletteCommand } from '../components/command-palette-context'
import { createEditorNote, demoEditorAdapters, Editor, EditorMode, useEditorTopicMode } from '@memorilo/editor'
import { readingFormatDisplayName } from '@memorilo/reading-format'
import { shelfReadingAcquisitions } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Cause, Effect, Exit, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  AlignLeft,
  BookOpen,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  ListTree,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Star,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'

import { useCommandPaletteCommands } from '../components/command-palette-context'
import { usePageTitlebar } from '../components/page-titlebar'
import { useDesktopConfiguration } from '../configuration-context'
import { useNotePersistence } from '../note-persistence-context'
import { noteQueryKeys } from '../queries/note-query-keys'
import { applyExternalNoteUpdate } from './-note-external-update'
import { editorRouteStyles } from './-note.stylex'

function desktopEditorAdapters(networkImagePasteBehavior: 'download' | 'url') {
  return {
    ...demoEditorAdapters,
    importNetworkImage: async (source: string) => (await window.desktop.importNetworkImage({ source })).src,
    networkImagePasteBehavior,
    uploadImage: async ({ file, onProgress }: Parameters<typeof demoEditorAdapters.uploadImage>[0]) => {
      const total = Math.max(file.size, 1)
      onProgress({ loaded: 0, total })
      const result = await window.desktop.saveImage({
        data: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        mimeType: file.type,
      })
      onProgress({ loaded: total, total })
      return result.src
    },
  }
}

const inspectorSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.28,
} as const

const entrySpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.2,
} as const

const effectQuery = createEffectQuery(Layer.empty)
const noteInspectorVisibleAtom = atomWithStorage(
  'memorilo.note-inspector-visible.v1',
  false,
  undefined,
  { getOnInit: true },
)

function setNoteFavoriteMutationOptions() {
  return effectQuery.mutationOptions<
    { favorite: boolean, noteId: string },
    Cause.UnknownError,
    never,
    { favorite: boolean, noteId: string }
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.setNoteFavorite(input)),
  })
}

interface VisibleNoteEntry {
  depth: number
  entry: NoteEntrySnapshot
  hasChildren: boolean
}

function visibleNoteEntries(
  entries: readonly NoteEntrySnapshot[],
  collapsedEntryIds: ReadonlySet<string>,
): readonly VisibleNoteEntry[] {
  const entriesById = new Map<string, NoteEntrySnapshot>()
  const parentsWithChildren = new Set<string>()
  const depths = new Map<string, number>()

  for (const entry of entries) {
    if (entriesById.has(entry.id))
      throw new Error(`Duplicate Note entry id: ${entry.id}`)
    entriesById.set(entry.id, entry)
    if (entry.parentId !== null)
      parentsWithChildren.add(entry.parentId)
  }

  const depthOf = (entry: NoteEntrySnapshot, visiting: Set<string>): number => {
    const cachedDepth = depths.get(entry.id)
    if (cachedDepth !== undefined)
      return cachedDepth
    if (visiting.has(entry.id))
      throw new Error(`Cycle detected at Note entry ${entry.id}`)

    visiting.add(entry.id)
    const depth = entry.parentId === null
      ? 0
      : (() => {
          const parent = entriesById.get(entry.parentId)
          if (!parent)
            throw new Error(`Note entry ${entry.id} has unknown parent ${entry.parentId}`)
          return depthOf(parent, visiting) + 1
        })()
    visiting.delete(entry.id)
    depths.set(entry.id, depth)
    return depth
  }

  for (const entry of entries)
    depthOf(entry, new Set())

  return entries.flatMap((entry) => {
    let parentId = entry.parentId
    while (parentId !== null) {
      if (collapsedEntryIds.has(parentId))
        return []
      const parent = entriesById.get(parentId)
      if (!parent)
        throw new Error(`Note entry ${entry.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
    const depth = depths.get(entry.id)
    if (depth === undefined)
      throw new Error(`Note entry ${entry.id} does not have a projected depth`)
    return [{ depth, entry, hasChildren: parentsWithChildren.has(entry.id) }]
  })
}

interface OpenEditorNote {
  entries: readonly NoteEntrySnapshot[]
  note: EditorNote
  stored: DesktopNote
  topic: EditorTopicDocument
}

interface ShelfBookOption {
  publication: ShelfPublication
  source: ShelfSource
}

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

interface EntryCreationTarget {
  kind: 'folder' | 'topic'
  parentId: string | null
}

type BookPickerTarget
  = | { kind: 'create', parentId: string | null }
    | { format: ShelfReadingFormat, kind: 'rebind', topicId: string }

function bookTopicReadingId(topic: BookTopicSnapshot): string {
  const hint = topic.book.retrievalHints[0]
  if (!hint)
    throw new Error(`BookTopic ${topic.id} is missing its reading locator`)
  return hint.readingId
}

interface TopicValidationError {
  diagnostics: string
  message: string
}

type CopyStatus = 'copied' | 'failed'

interface CopyFeedback {
  diagnostics: string
  status: CopyStatus
}

function formatTopicValidationDiagnostics(
  note: EditorNote,
  topicId: string,
  effectOutput: string,
): string {
  const sections = [`Topic ID: ${topicId}`]
  try {
    const input = note.getTopicValidationInput(topicId)
    sections.push(`Invalid Topic JSON:\n${JSON.stringify(input, null, 2)}`)
  }
  catch (error) {
    sections.push(`Invalid Topic JSON:\nUnable to project Topic: ${error instanceof Error ? error.message : String(error)}`)
  }
  sections.push(`Effect validation output:\n${effectOutput}`)
  return sections.join('\n\n')
}

async function loadReadableShelfBooks(): Promise<readonly ShelfBookOption[]> {
  const sources = await window.desktop.listShelfSources()
  const books: ShelfBookOption[] = []
  const seen = new Set<string>()
  for (const source of sources.filter(source => source.enabled)) {
    let pageUrl: string | undefined
    const visitedUrls = new Set<string>()
    while (true) {
      const result = await window.desktop.refreshShelfView({
        ...(pageUrl === undefined ? {} : { pageUrl }),
        sourceId: source.id,
      })
      const group = result.groups.find(candidate => candidate.source.id === source.id)
      if (!group)
        throw new Error(`Shelf source ${source.id} was not returned`)
      if (group.issue && !group.page)
        throw new Error(group.issue.message)
      if (group.page) {
        for (const publication of group.page.publications) {
          if (shelfReadingAcquisitions(publication).length === 0)
            continue
          const key = `${source.id}:${publication.id}`
          if (seen.has(key))
            continue
          seen.add(key)
          books.push({ publication, source: group.source })
        }
      }
      const nextUrl = group.page?.nextUrl
      if (nextUrl === null || nextUrl === undefined || visitedUrls.has(nextUrl))
        break
      visitedUrls.add(nextUrl)
      pageUrl = nextUrl
    }
  }
  return books
}

function BookTopicPickerDialog({
  mode,
  onClose,
  onCreate,
  requiredFormat,
}: {
  mode: 'create' | 'rebind'
  onClose: () => void
  onCreate: (option: ShelfBookOption, format: ShelfReadingFormat) => Promise<void>
  requiredFormat?: ShelfReadingFormat
}) {
  const { t } = useTranslation('editor')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<ShelfReadingFormat | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const booksQuery = useQuery({
    queryFn: loadReadableShelfBooks,
    queryKey: ['book-topic-shelf-books'],
    retry: false,
    staleTime: 30_000,
  })
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return (booksQuery.data ?? []).filter(({ publication, source }) => {
      if (requiredFormat !== undefined
        && !shelfReadingAcquisitions(publication).some(acquisition => acquisition.format === requiredFormat)) {
        return false
      }
      return normalizedQuery.length === 0
        || `${publication.title} ${publication.authors.join(' ')} ${source.name}`.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [booksQuery.data, query, requiredFormat])
  const selectedOption = useMemo(
    () => (booksQuery.data ?? []).find(({ publication, source }) => `${source.id}:${publication.id}` === selectedKey),
    [booksQuery.data, selectedKey],
  )
  const formats = selectedOption
    ? shelfReadingAcquisitions(selectedOption.publication)
        .filter(acquisition => requiredFormat === undefined || acquisition.format === requiredFormat)
    : []
  const activeFormat = formats.some(acquisition => acquisition.format === selectedFormat)
    ? selectedFormat
    : formats[0]?.format ?? null

  const submit = async () => {
    if (!selectedOption || activeFormat === null)
      return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(selectedOption, activeFormat)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <div {...stylex.props(editorRouteStyles.bookPickerOverlay)}>
      <section
        {...stylex.props(editorRouteStyles.bookPickerDialog)}
        aria-describedby="book-topic-picker-description"
        aria-labelledby="book-topic-picker-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(editorRouteStyles.bookPickerHeader)}>
          <div>
            <h1 id="book-topic-picker-title" {...stylex.props(editorRouteStyles.bookPickerTitle)}>
              {mode === 'rebind' ? t('rebindBook') : t('addBook')}
            </h1>
            <p id="book-topic-picker-description" {...stylex.props(editorRouteStyles.bookPickerDescription)}>
              {mode === 'rebind' ? t('rebindBookDescription') : t('addBookDescription')}
            </p>
          </div>
          <button
            {...stylex.props(editorRouteStyles.inspectorCloseButton)}
            aria-label={t('closeBookPicker')}
            title={t('closeBookPicker')}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div {...stylex.props(editorRouteStyles.bookPickerBody)}>
          {mode === 'rebind'
            ? <p {...stylex.props(editorRouteStyles.bookPickerWarning)}>{t('rebindBookWarning')}</p>
            : null}
          <label {...stylex.props(editorRouteStyles.bookPickerSearch)}>
            <Search aria-hidden="true" size={15} strokeWidth={1.8} />
            <input
              {...stylex.props(editorRouteStyles.bookPickerSearchInput)}
              aria-label={t('searchBooks')}
              placeholder={t('searchBooks')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          {booksQuery.isPending
            ? <p {...stylex.props(editorRouteStyles.bookPickerStatus)} role="status">{t('loadingBooks')}</p>
            : booksQuery.error
              ? <p {...stylex.props(editorRouteStyles.bookPickerError)} role="alert">{booksQuery.error instanceof Error ? booksQuery.error.message : String(booksQuery.error)}</p>
              : filteredBooks.length === 0
                ? <p {...stylex.props(editorRouteStyles.bookPickerStatus)}>{t('noReadableBooks')}</p>
                : (
                    <div {...stylex.props(editorRouteStyles.bookPickerList)} role="listbox" aria-label={t('searchBooks')}>
                      {filteredBooks.map((option) => {
                        const key = `${option.source.id}:${option.publication.id}`
                        const formatsForOption = shelfReadingAcquisitions(option.publication)
                        return (
                          <button
                            key={key}
                            {...stylex.props(
                              editorRouteStyles.bookPickerOption,
                              selectedKey === key && editorRouteStyles.bookPickerOptionSelected,
                            )}
                            aria-selected={selectedKey === key}
                            role="option"
                            type="button"
                            onClick={() => {
                              const matchingFormat = formatsForOption.find(
                                acquisition => requiredFormat === undefined || acquisition.format === requiredFormat,
                              )
                              setSelectedKey(key)
                              setSelectedFormat(matchingFormat === undefined ? null : matchingFormat.format)
                              setError(null)
                            }}
                          >
                            <span {...stylex.props(editorRouteStyles.bookPickerOptionText)}>
                              <strong {...stylex.props(editorRouteStyles.bookPickerOptionTitle)}>{option.publication.title}</strong>
                              <span {...stylex.props(editorRouteStyles.bookPickerOptionDetail)}>{option.source.name}</span>
                            </span>
                            <span {...stylex.props(editorRouteStyles.bookPickerFormatList)}>
                              {formatsForOption.map(acquisition => readingFormatDisplayName(acquisition.format)).join(' · ')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
          {selectedOption && formats.length > 0
            ? (
                <label {...stylex.props(editorRouteStyles.bookPickerFormatField)}>
                  <span>{t('bookFormat')}</span>
                  <select
                    {...stylex.props(editorRouteStyles.bookPickerFormatSelect)}
                    value={activeFormat ?? ''}
                    onChange={event => setSelectedFormat(event.target.value as ShelfReadingFormat)}
                  >
                    {formats.map(acquisition => (
                      <option key={acquisition.format} value={acquisition.format}>
                        {readingFormatDisplayName(acquisition.format)}
                      </option>
                    ))}
                  </select>
                </label>
              )
            : null}
          {error
            ? <p {...stylex.props(editorRouteStyles.bookPickerError)} role="alert">{error}</p>
            : null}
        </div>
        <footer {...stylex.props(editorRouteStyles.bookPickerFooter)}>
          <button
            {...stylex.props(editorRouteStyles.bookPickerCancel)}
            disabled={submitting}
            type="button"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            {...stylex.props(editorRouteStyles.bookPickerCreate)}
            disabled={submitting || selectedOption === undefined || activeFormat === null}
            type="button"
            onClick={() => void submit()}
          >
            {submitting
              ? mode === 'rebind' ? t('rebindingBook') : t('addingBook')
              : mode === 'rebind' ? t('rebindBook') : t('addBook')}
          </button>
        </footer>
      </section>
    </div>
  )
}

function EntryCreationDialog({
  kind,
  onClose,
  onCreate,
}: {
  kind: EntryCreationTarget['kind']
  onClose: () => void
  onCreate: (label: string) => void
}) {
  const { t } = useTranslation('editor')
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const title = kind === 'folder' ? t('newFolder') : t('newTopic')
  const fieldLabel = kind === 'folder' ? t('folderName') : t('topicTitle')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = label.trim()
    if (normalized.length === 0) {
      setError(t('entryNameRequired'))
      return
    }
    try {
      onCreate(normalized)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div
      {...stylex.props(editorRouteStyles.bookPickerOverlay)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <form
        {...stylex.props(editorRouteStyles.entryCreationDialog)}
        aria-labelledby="entry-creation-title"
        aria-modal="true"
        role="dialog"
        onSubmit={submit}
      >
        <header {...stylex.props(editorRouteStyles.bookPickerHeader)}>
          <h1 id="entry-creation-title" {...stylex.props(editorRouteStyles.bookPickerTitle)}>{title}</h1>
          <button
            {...stylex.props(editorRouteStyles.inspectorCloseButton)}
            aria-label={t('closeEntryDialog')}
            title={t('closeEntryDialog')}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div {...stylex.props(editorRouteStyles.entryCreationBody)}>
          <label {...stylex.props(editorRouteStyles.entryCreationField)}>
            <span>{fieldLabel}</span>
            <input
              {...stylex.props(editorRouteStyles.entryCreationInput)}
              autoFocus
              required
              value={label}
              onChange={(event) => {
                setLabel(event.target.value)
                setError(null)
              }}
            />
          </label>
          {error
            ? <p {...stylex.props(editorRouteStyles.bookPickerError)} role="alert">{error}</p>
            : null}
        </div>
        <footer {...stylex.props(editorRouteStyles.bookPickerFooter)}>
          <button {...stylex.props(editorRouteStyles.bookPickerCancel)} type="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            {...stylex.props(editorRouteStyles.bookPickerCreate)}
            disabled={label.trim().length === 0}
            type="submit"
          >
            {t('create')}
          </button>
        </footer>
      </form>
    </div>
  )
}

function OpenedTopicEditor({
  collapsedEntryIds,
  favoritePending,
  focusBlockId,
  onAddBook,
  onAddFolder,
  onAddTopic,
  onRebindBook,
  onRenameNote,
  onToggleEntry,
  onToggleFavorite,
  opened,
  saveError,
  validationError,
}: {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onAddBook: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onAddTopic: (parentId: string | null) => void
  onRebindBook: (topicId: string) => void
  onRenameNote: (note: EditorNote, title: string) => Promise<{ error?: string } | void>
  onToggleEntry: (entryId: string) => void
  onToggleFavorite: () => void
  opened: OpenEditorNote
  saveError: string | null
  validationError: TopicValidationError | null
}) {
  const { t } = useTranslation('editor')
  const [addSubmenuOpen, setAddSubmenuOpen] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const [entryContextMenu, setEntryContextMenu] = useState<EntryContextMenu | null>(null)
  const [inspectorVisible, setInspectorVisible] = useAtom(noteInspectorVisibleAtom)
  const configuration = useDesktopConfiguration()
  const addMenuFirstItemRef = useRef<HTMLButtonElement>(null)
  const addMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const availabilityRequestRef = useRef(0)
  const editorAdapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )
  const shouldReduceMotion = useReducedMotion()
  const inspectorTransition = shouldReduceMotion ? { duration: 0 } : inspectorSpring
  const entryTransition = shouldReduceMotion ? { duration: 0 } : entrySpring
  const visibleEntries = useMemo(
    () => visibleNoteEntries(opened.entries, collapsedEntryIds),
    [collapsedEntryIds, opened.entries],
  )
  const topicCount = useMemo(
    () => opened.entries.reduce((count, entry) => count + (entry.kind === 'topic' ? 1 : 0), 0),
    [opened.entries],
  )
  const mode = useEditorTopicMode(opened.topic)
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [setInspectorVisible])
  const closeEntryContextMenu = useCallback(() => {
    availabilityRequestRef.current += 1
    setAddSubmenuOpen(false)
    setEntryContextMenu(null)
  }, [])
  const openEntryContextMenu = useCallback((
    event: ReactMouseEvent,
    parentId: string | null,
    allowFolder: boolean,
  ) => {
    event.preventDefault()
    availabilityRequestRef.current += 1
    setAddSubmenuOpen(false)
    setEntryContextMenu({ allowFolder, kind: 'container', parentId, x: event.clientX, y: event.clientY })
  }, [])
  const openBookTopicContextMenu = useCallback((
    event: ReactMouseEvent,
    topicId: string,
    readingId: string,
  ) => {
    event.preventDefault()
    const requestId = availabilityRequestRef.current + 1
    availabilityRequestRef.current = requestId
    setAddSubmenuOpen(false)
    setEntryContextMenu({
      kind: 'book',
      readingId,
      resourceState: 'checking',
      topicId,
      x: event.clientX,
      y: event.clientY,
    })
    void window.desktop.isBookReadingAvailable(readingId).then(
      (available) => {
        if (availabilityRequestRef.current !== requestId)
          return
        setEntryContextMenu(current => current?.kind === 'book'
          && current.readingId === readingId
          && current.topicId === topicId
          ? { ...current, resourceState: available ? 'available' : 'missing' }
          : current)
      },
      (cause) => {
        console.error(`Failed to check reading file ${readingId}`, cause)
        if (availabilityRequestRef.current !== requestId)
          return
        setEntryContextMenu(current => current?.kind === 'book'
          && current.readingId === readingId
          && current.topicId === topicId
          ? { ...current, resourceState: 'error' }
          : current)
      },
    )
  }, [])
  const showDocumentMode = useCallback(() => opened.topic.setMode(EditorMode.Document), [opened.topic])
  const showOutlineMode = useCallback(() => opened.topic.setMode(EditorMode.Outline), [opened.topic])
  const modeCommands = useMemo<readonly PaletteCommand[]>(() => mode === EditorMode.Document
    ? [{
        accent: 'violet',
        action: t('switchMode'),
        description: t('switchToOutlineDescription'),
        icon: ListTree,
        id: 'editor-mode-outline',
        keywords: t('switchToOutlineKeywords') as unknown as readonly string[],
        label: t('switchToOutlineMode'),
        run: showOutlineMode,
        section: t('editorSection') as PaletteCommand['section'],
      }]
    : [{
        accent: 'blue',
        action: t('switchMode'),
        description: t('switchToDocumentDescription'),
        icon: AlignLeft,
        id: 'editor-mode-document',
        keywords: t('switchToDocumentKeywords') as unknown as readonly string[],
        label: t('switchToDocumentMode'),
        run: showDocumentMode,
        section: t('editorSection') as PaletteCommand['section'],
      }], [mode, showDocumentMode, showOutlineMode, t])
  useCommandPaletteCommands(modeCommands)

  useEffect(() => {
    if (!entryContextMenu)
      return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        closeEntryContextMenu()
    }
    window.addEventListener('pointerdown', closeEntryContextMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeEntryContextMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeEntryContextMenu, entryContextMenu])
  const renameNote = useCallback((title: string) => onRenameNote(opened.note, title), [onRenameNote, opened.note])
  const copyValidationDiagnostics = useCallback(async () => {
    if (!validationError)
      return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function')
        throw new Error('The Clipboard API is unavailable')
      await navigator.clipboard.writeText(validationError.diagnostics)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'copied' })
    }
    catch (error) {
      console.error('Failed to copy Topic validation diagnostics', error)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'failed' })
    }
  }, [validationError])
  const copyStatus = copyFeedback !== null && copyFeedback.diagnostics === validationError?.diagnostics
    ? copyFeedback.status
    : null
  const titlebar = useMemo(() => ({
    onRenameTitle: renameNote,
    title: opened.stored.title,
    trailing: (
      <>
        <button
          {...stylex.props(
            editorRouteStyles.titlebarActionButton,
            opened.stored.favorite && editorRouteStyles.titlebarFavoriteActive,
          )}
          aria-label={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
          aria-pressed={opened.stored.favorite}
          disabled={favoritePending}
          title={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
          type="button"
          onClick={onToggleFavorite}
        >
          <Star
            aria-hidden="true"
            fill={opened.stored.favorite ? 'currentColor' : 'none'}
            size={16}
            strokeWidth={1.8}
          />
        </button>
        <button
          {...stylex.props(editorRouteStyles.titlebarActionButton)}
          aria-label={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
          title={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
          type="button"
          onClick={toggleInspector}
        >
          <PanelRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </>
    ),
  }), [
    favoritePending,
    inspectorVisible,
    onToggleFavorite,
    opened.stored.favorite,
    opened.stored.title,
    renameNote,
    t,
    toggleInspector,
  ])
  usePageTitlebar(titlebar)
  const entryContextMenuLayout = useMemo(() => {
    if (!entryContextMenu)
      return null
    const viewportInset = 8
    const menuWidth = 168
    const menuGap = 4
    const menuPadding = 8
    const menuItemHeight = 30
    const mainItemCount = entryContextMenu.kind === 'book' && entryContextMenu.resourceState !== 'available' ? 2 : 1
    const submenuItemCount = entryContextMenu.kind === 'container' && entryContextMenu.allowFolder ? 3 : 2
    const requiredHeight = Math.max(
      menuPadding + mainItemCount * menuItemHeight,
      menuPadding + submenuItemCount * menuItemHeight,
    )
    const left = Math.max(
      viewportInset,
      Math.min(entryContextMenu.x, Math.max(viewportInset, window.innerWidth - menuWidth - viewportInset)),
    )
    const top = Math.max(
      viewportInset,
      Math.min(entryContextMenu.y, Math.max(viewportInset, window.innerHeight - requiredHeight - viewportInset)),
    )
    return {
      left,
      submenuOpensLeft: left + menuWidth + menuGap + menuWidth > window.innerWidth - viewportInset,
      top,
    }
  }, [entryContextMenu])
  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <section {...stylex.props(editorRouteStyles.workspace)} aria-label={opened.stored.title}>
        {saveError || validationError
          ? (
              <div {...stylex.props(editorRouteStyles.alertStack)}>
                {validationError
                  ? (
                      <div {...stylex.props(editorRouteStyles.validationError)}>
                        <span {...stylex.props(editorRouteStyles.validationErrorMessage)} aria-live="assertive" role="alert">
                          {validationError.message}
                        </span>
                        <div {...stylex.props(editorRouteStyles.validationErrorActions)}>
                          <button
                            {...stylex.props(editorRouteStyles.copyDiagnosticsButton)}
                            aria-label={t('copyDiagnosticsLabel')}
                            title={t('copyDiagnosticsLabel')}
                            type="button"
                            onClick={copyValidationDiagnostics}
                          >
                            <Copy aria-hidden="true" size={14} strokeWidth={1.9} />
                            <span>{t('copyDiagnostics')}</span>
                          </button>
                          <span {...stylex.props(editorRouteStyles.copyDiagnosticsStatus)} aria-live="polite" role="status">
                            {copyStatus === 'copied' ? t('copied', { ns: 'common' }) : copyStatus === 'failed' ? t('copyFailed', { ns: 'common' }) : ''}
                          </span>
                        </div>
                      </div>
                    )
                  : null}
                {saveError
                  ? (
                      <div {...stylex.props(editorRouteStyles.saveError)} aria-live="polite" role="status">
                        {t('failedToSaveNote', { message: saveError })}
                      </div>
                    )
                  : null}
              </div>
            )
          : null}
        <Editor
          adapters={editorAdapters}
          focus={focusBlockId === undefined ? undefined : { blockId: focusBlockId }}
          outline={{ outdentBehavior: configuration.outdentBehavior }}
          topic={opened.topic}
        />
      </section>
      <AnimatePresence initial={false}>
        {inspectorVisible
          ? (
              <motion.aside
                {...stylex.props(editorRouteStyles.inspector)}
                animate={{ opacity: 1, width: 292, x: 0 }}
                aria-label={t('noteInspector')}
                exit={{ opacity: 0, width: 0, x: 18 }}
                initial={{ opacity: 0, width: 0, x: 18 }}
                transition={inspectorTransition}
              >
                <header {...stylex.props(editorRouteStyles.inspectorTitlebar)}>
                  <div {...stylex.props(editorRouteStyles.inspectorTitleGroup)}>
                    <h1 {...stylex.props(editorRouteStyles.inspectorTitle)}>{t('topics')}</h1>
                    <span {...stylex.props(editorRouteStyles.inspectorCount)}>{topicCount}</span>
                  </div>
                </header>
                <div {...stylex.props(editorRouteStyles.inspectorContent)}>
                  <section {...stylex.props(editorRouteStyles.inspectorSection)} aria-labelledby="topic-structure-heading">
                    <div
                      {...stylex.props(editorRouteStyles.inspectorSectionHeading)}
                      onContextMenu={event => openEntryContextMenu(event, null, true)}
                    >
                      <h2 id="topic-structure-heading" {...stylex.props(editorRouteStyles.inspectorSectionTitle)}>
                        {t('structure')}
                      </h2>
                      <span {...stylex.props(editorRouteStyles.inspectorSectionMeta)}>{t('due', { count: 2 })}</span>
                    </div>
                    <div {...stylex.props(editorRouteStyles.topicTree)} role="list">
                      <AnimatePresence initial={false}>
                        {visibleEntries.map(({ depth, entry, hasChildren }) => {
                          const collapsed = collapsedEntryIds.has(entry.id)
                          const label = entry.kind === 'folder' ? entry.name : entry.title || t('untitledTopic')
                          const current = entry.kind === 'topic' && entry.id === opened.topic.topicId
                          const topicContextMenu = entry.kind === 'topic'
                            ? entry.topicType === 'book'
                              ? (event: ReactMouseEvent) => openBookTopicContextMenu(
                                  event,
                                  entry.id,
                                  bookTopicReadingId(entry),
                                )
                              : (event: ReactMouseEvent) => openEntryContextMenu(event, entry.id, false)
                            : undefined

                          return (
                            <motion.div
                              key={entry.id}
                              {...stylex.props(
                                editorRouteStyles.entryRow(depth),
                                current && editorRouteStyles.entryRowCurrent,
                              )}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                              layout={shouldReduceMotion ? false : 'position'}
                              role="listitem"
                              transition={entryTransition}
                            >
                              {entry.kind === 'folder'
                                ? (
                                    <button
                                      {...stylex.props(editorRouteStyles.folderEntryButton)}
                                      aria-expanded={hasChildren ? !collapsed : undefined}
                                      disabled={!hasChildren}
                                      title={label}
                                      type="button"
                                      onClick={() => onToggleEntry(entry.id)}
                                      onContextMenu={event => openEntryContextMenu(event, entry.id, true)}
                                    >
                                      <motion.span
                                        {...stylex.props(editorRouteStyles.entryDisclosure)}
                                        animate={{ rotate: hasChildren && !collapsed ? 90 : 0 }}
                                        transition={entryTransition}
                                      >
                                        {hasChildren
                                          ? <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                          : null}
                                      </motion.span>
                                      {hasChildren && !collapsed
                                        ? <FolderOpen {...stylex.props(editorRouteStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />
                                        : <Folder {...stylex.props(editorRouteStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />}
                                      <span {...stylex.props(editorRouteStyles.entryLabel)}>{label}</span>
                                    </button>
                                  )
                                : (
                                    <div
                                      {...stylex.props(editorRouteStyles.topicEntry)}
                                      onContextMenu={topicContextMenu}
                                    >
                                      {hasChildren
                                        ? (
                                            <button
                                              {...stylex.props(editorRouteStyles.entryDisclosureButton)}
                                              aria-label={t('collapsedExpand', { action: collapsed ? t('expand') : t('collapse'), label })}
                                              aria-expanded={!collapsed}
                                              type="button"
                                              onClick={() => onToggleEntry(entry.id)}
                                            >
                                              <motion.span
                                                {...stylex.props(editorRouteStyles.entryDisclosure)}
                                                animate={{ rotate: collapsed ? 0 : 90 }}
                                                transition={entryTransition}
                                              >
                                                <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                              </motion.span>
                                            </button>
                                          )
                                        : <span {...stylex.props(editorRouteStyles.entryDisclosurePlaceholder)} />}
                                      {entry.topicType === 'book'
                                        ? (
                                            <BookOpen
                                              {...stylex.props(
                                                editorRouteStyles.topicIcon,
                                                current && editorRouteStyles.topicIconCurrent,
                                              )}
                                              aria-hidden="true"
                                              size={14}
                                              strokeWidth={1.7}
                                            />
                                          )
                                        : (
                                            <FileText
                                              {...stylex.props(
                                                editorRouteStyles.topicIcon,
                                                current && editorRouteStyles.topicIconCurrent,
                                              )}
                                              aria-hidden="true"
                                              size={14}
                                              strokeWidth={1.7}
                                            />
                                          )}
                                      {entry.topicType === 'book'
                                        ? (
                                            <Link
                                              {...stylex.props(
                                                editorRouteStyles.topicLink,
                                                current && editorRouteStyles.topicLinkCurrent,
                                              )}
                                              aria-current={current ? 'page' : undefined}
                                              params={{ readingId: bookTopicReadingId(entry) }}
                                              preload="intent"
                                              search={{ noteId: opened.note.id, topicId: entry.id }}
                                              title={label}
                                              to="/reader/$readingId"
                                            >
                                              <span {...stylex.props(editorRouteStyles.entryLabel)}>{label}</span>
                                            </Link>
                                          )
                                        : (
                                            <Link
                                              {...stylex.props(
                                                editorRouteStyles.topicLink,
                                                current && editorRouteStyles.topicLinkCurrent,
                                              )}
                                              aria-current={current ? 'page' : undefined}
                                              params={{ noteId: opened.note.id, topicId: entry.id }}
                                              preload="intent"
                                              search={{}}
                                              title={label}
                                              to="/note/$noteId/$topicId"
                                            >
                                              <span {...stylex.props(editorRouteStyles.entryLabel)}>{label}</span>
                                            </Link>
                                          )}
                                    </div>
                                  )}
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                  </section>
                  <section
                    {...stylex.props(editorRouteStyles.inspectorSection, editorRouteStyles.learningSection)}
                    aria-labelledby="learning-status-heading"
                  >
                    <div {...stylex.props(editorRouteStyles.inspectorSectionHeading)}>
                      <h2 id="learning-status-heading" {...stylex.props(editorRouteStyles.inspectorSectionTitle)}>
                        {t('learning')}
                      </h2>
                      <span {...stylex.props(editorRouteStyles.learningState)}>
                        <span {...stylex.props(editorRouteStyles.learningStateDot)} />
                        {t('reviewing')}
                      </span>
                    </div>
                    <dl {...stylex.props(editorRouteStyles.learningDetails)}>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('nextReview')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue, editorRouteStyles.learningValueDue)}>{t('today')}</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('stability')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>3.2 days</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('priority')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>{t('normal')}</dd>
                      </div>
                    </dl>
                    <div {...stylex.props(editorRouteStyles.learningProgressHeader)}>
                      <span>{t('reviewed')}</span>
                      <span>{t('topicsProgress', { count: 3, total: 6 })}</span>
                    </div>
                    <div
                      {...stylex.props(editorRouteStyles.learningProgressTrack)}
                      aria-label={t('topicsReviewed', { count: 3, total: 6 })}
                      aria-valuemax={6}
                      aria-valuemin={0}
                      aria-valuenow={3}
                      role="progressbar"
                    >
                      <div {...stylex.props(editorRouteStyles.learningProgressFill)} />
                    </div>
                  </section>
                </div>
              </motion.aside>
            )
          : null}
      </AnimatePresence>
      {entryContextMenu && entryContextMenuLayout
        ? (
            <div
              {...stylex.props(editorRouteStyles.entryContextMenu)}
              role="menu"
              style={{
                left: entryContextMenuLayout.left,
                top: entryContextMenuLayout.top,
              }}
              onContextMenu={event => event.preventDefault()}
              onPointerDown={event => event.stopPropagation()}
            >
              <div
                {...stylex.props(editorRouteStyles.entryContextSubmenuTrigger)}
                onPointerEnter={() => setAddSubmenuOpen(true)}
              >
                <button
                  ref={addMenuTriggerRef}
                  {...stylex.props(editorRouteStyles.entryContextMenuItem)}
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
                    {...stylex.props(editorRouteStyles.entryContextMenuItemTrailing)}
                    aria-hidden="true"
                    size={13}
                    strokeWidth={1.8}
                  />
                </button>
                {addSubmenuOpen
                  ? (
                      <div
                        {...stylex.props(
                          editorRouteStyles.entryContextSubmenu,
                          entryContextMenuLayout.submenuOpensLeft && editorRouteStyles.entryContextSubmenuLeft,
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
                          {...stylex.props(editorRouteStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddTopic(entryContextMenu.kind === 'book'
                              ? entryContextMenu.topicId
                              : entryContextMenu.parentId)
                            closeEntryContextMenu()
                          }}
                        >
                          <FileText aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('topic')}
                        </button>
                        {entryContextMenu.kind === 'container' && entryContextMenu.allowFolder
                          ? (
                              <button
                                {...stylex.props(editorRouteStyles.entryContextMenuItem)}
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                  onAddFolder(entryContextMenu.parentId)
                                  closeEntryContextMenu()
                                }}
                              >
                                <Folder aria-hidden="true" size={14} strokeWidth={1.8} />
                                {t('folder')}
                              </button>
                            )
                          : null}
                        <button
                          {...stylex.props(editorRouteStyles.entryContextMenuItem)}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            onAddBook(entryContextMenu.kind === 'book'
                              ? entryContextMenu.topicId
                              : entryContextMenu.parentId)
                            closeEntryContextMenu()
                          }}
                        >
                          <BookOpen aria-hidden="true" size={14} strokeWidth={1.8} />
                          {t('book')}
                        </button>
                      </div>
                    )
                  : null}
              </div>
              {entryContextMenu.kind === 'book' && entryContextMenu.resourceState === 'missing'
                ? (
                    <button
                      {...stylex.props(editorRouteStyles.entryContextMenuItem)}
                      role="menuitem"
                      type="button"
                      onFocus={() => setAddSubmenuOpen(false)}
                      onPointerEnter={() => setAddSubmenuOpen(false)}
                      onClick={() => {
                        onRebindBook(entryContextMenu.topicId)
                        closeEntryContextMenu()
                      }}
                    >
                      <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
                      {t('rebindBook')}
                    </button>
                  )
                : null}
              {entryContextMenu.kind === 'book'
                && (entryContextMenu.resourceState === 'checking' || entryContextMenu.resourceState === 'error')
                ? (
                    <button
                      {...stylex.props(
                        editorRouteStyles.entryContextMenuItem,
                        editorRouteStyles.entryContextMenuItemDisabled,
                      )}
                      aria-disabled="true"
                      disabled
                      role="menuitem"
                      type="button"
                    >
                      {entryContextMenu.resourceState === 'checking'
                        ? <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
                        : <CircleAlert aria-hidden="true" size={14} strokeWidth={1.8} />}
                      {entryContextMenu.resourceState === 'checking'
                        ? t('checkingBookAvailability')
                        : t('bookAvailabilityCheckFailed')}
                    </button>
                  )
                : null}
            </div>
          )
        : null}
    </main>
  )
}

export function NoteEditor({
  collapsedEntryIds,
  focusBlockId,
  noteId,
  onToggleEntry,
  topicId,
}: {
  collapsedEntryIds: ReadonlySet<string>
  focusBlockId?: string
  noteId: string
  onToggleEntry: (entryId: string) => void
  topicId: string
}) {
  const { t } = useTranslation(['editor', 'pages'])
  const [opened, setOpened] = useState<OpenEditorNote | null>(null)
  const [bookPickerTarget, setBookPickerTarget] = useState<BookPickerTarget | undefined>(undefined)
  const [entryCreationTarget, setEntryCreationTarget] = useState<EntryCreationTarget | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<TopicValidationError | null>(null)
  const queryClient = useQueryClient()
  const persistence = useNotePersistence(noteId)
  const { discard, enqueue, getPendingChanges, subscribeReceipts } = persistence
  const noteRef = useRef<EditorNote | null>(null)
  const storedRef = useRef<DesktopNote | null>(null)
  const restoringRef = useRef(false)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const latestValidSnapshotRef = useRef<Uint8Array | null>(null)
  const handleNoteChangeRef = useRef<(change: EditorNoteChange) => void>(() => undefined)
  const { isPending: favoritePending, mutate: mutateFavorite } = useMutation({
    ...setNoteFavoriteMutationOptions(),
    onSuccess: (state) => {
      setOpened(current => current && current.stored.id === state.noteId
        ? { ...current, stored: { ...current.stored, favorite: state.favorite } }
        : current)
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  })

  useEffect(() => subscribeReceipts((savedNoteId, receipt) => {
    const currentNote = noteRef.current
    if (currentNote?.id !== savedNoteId)
      return
    setOpened((current) => {
      if (!current || current.note !== currentNote)
        return current
      const stored = { ...current.stored, updatedAt: receipt.updatedAt }
      storedRef.current = stored
      return { ...current, entries: currentNote.getEntries(), stored }
    })
  }), [subscribeReceipts])

  const rebuildFromLatestValidSnapshot = useCallback((validationError: TopicValidationError) => {
    const current = noteRef.current
    const snapshot = latestValidSnapshotRef.current
    const stored = storedRef.current
    if (!current || !snapshot || !stored || restoringRef.current)
      return

    restoringRef.current = true
    discard()
    unsubscribeRef.current?.()
    unsubscribeRef.current = undefined
    const restored = createEditorNote({ id: current.id, snapshot })
    const restoredTopic = restored.getEntries().find(entry => entry.kind === 'topic' && entry.id === topicId)
    if (!restoredTopic) {
      restoringRef.current = false
      setValidationError({
        diagnostics: validationError.diagnostics,
        message: t('restoreFailedMessage', { topicId }),
      })
      return
    }
    noteRef.current = restored
    latestValidSnapshotRef.current = restored.exportSnapshot()
    enqueue({ noteId: restored.id, update: restored.exportUpdates() })
    unsubscribeRef.current = restored.subscribe(change => handleNoteChangeRef.current(change))
    setOpened({
      entries: restored.getEntries(),
      note: restored,
      stored,
      topic: restored.getTopic(topicId),
    })
    setValidationError(validationError)
    restoringRef.current = false
  }, [discard, enqueue, t, topicId])

  const handleNoteChange = useCallback((change: EditorNoteChange) => {
    if (restoringRef.current)
      return
    const note = noteRef.current
    if (!note)
      return

    const entriesExit = Effect.runSyncExit(Effect.try({
      try: () => note.getEntries(),
      catch: error => error instanceof Error ? error : new Error(String(error)),
    }))
    if (Exit.isFailure(entriesExit)) {
      const effectOutput = Cause.pretty(entriesExit.cause)
      console.error('Topic entry projection failed; restoring the latest valid Note snapshot', effectOutput)
      rebuildFromLatestValidSnapshot({
        diagnostics: formatTopicValidationDiagnostics(note, topicId, effectOutput),
        message: t('invalidStructureReverted', { ns: 'editor' }),
      })
      return
    }

    for (const entry of entriesExit.value) {
      if (entry.kind !== 'topic')
        continue
      const validationExit = Effect.runSyncExit(note.validateTopic(entry.id))
      if (Exit.isSuccess(validationExit))
        continue
      const effectOutput = Cause.pretty(validationExit.cause)
      console.error('Topic validation failed; restoring the latest valid Note snapshot', effectOutput)
      rebuildFromLatestValidSnapshot({
        diagnostics: formatTopicValidationDiagnostics(note, entry.id, effectOutput),
        message: t('invalidStructureReverted', { ns: 'editor' }),
      })
      return
    }

    setValidationError(null)
    latestValidSnapshotRef.current = note.exportSnapshot()
    enqueue(change)
    setOpened(current => current && current.note === note
      ? { ...current, entries: note.getEntries() }
      : current)
  }, [enqueue, rebuildFromLatestValidSnapshot, t, topicId])
  handleNoteChangeRef.current = handleNoteChange

  useEffect(() => window.desktop.subscribeNoteUpdates((external) => {
    const note = noteRef.current
    if (!note || note.id !== external.noteId)
      return
    try {
      const applied = applyExternalNoteUpdate(note, external)
      if (!applied)
        return
      latestValidSnapshotRef.current = applied.snapshot
      setOpened((current) => {
        if (!current || current.note !== note)
          return current
        const stored = { ...current.stored, updatedAt: applied.updatedAt }
        storedRef.current = stored
        return { ...current, entries: applied.entries, stored }
      })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    }
    catch (error) {
      console.error(`Failed to apply external update for Note ${external.noteId}`, error)
    }
  }), [queryClient])

  const resetViewState = useCallback(() => {
    setOpened(null)
    setLoadError(null)
    setValidationError(null)
  }, [])

  const handleRenameNote = useCallback(async (note: EditorNote, title: string) => {
    const result = await window.desktop.renameNote({ noteId: note.id, title })
    if (result.status === 'duplicate-title')
      return { error: t('duplicateTitle', { ns: 'pages' }) }

    if (noteRef.current !== note)
      return
    note.renameNote(result.note.title)
    if (storedRef.current?.id === note.id) {
      storedRef.current = {
        ...storedRef.current,
        title: result.note.title,
        updatedAt: result.note.updatedAt,
      }
    }
    setOpened((current) => {
      if (!current || current.note !== note)
        return current
      return {
        ...current,
        stored: {
          ...current.stored,
          title: result.note.title,
          updatedAt: result.note.updatedAt,
        },
      }
    })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
  }, [queryClient, t])

  const handleToggleFavorite = useCallback(() => {
    if (!opened)
      return
    mutateFavorite({ favorite: !opened.stored.favorite, noteId: opened.stored.id })
  }, [mutateFavorite, opened])

  const handleCreateBookTopic = useCallback(async (
    option: ShelfBookOption,
    format: ShelfReadingFormat,
    parentId: string | null,
  ) => {
    const note = noteRef.current
    if (!note)
      throw new Error('The Note is no longer open')
    const prepared = await window.desktop.prepareShelfReading({
      format,
      publicationId: option.publication.id,
      retention: 'library',
      sourceId: option.source.id,
    })
    note.createBookTopic({
      book: prepared.book,
      mode: EditorMode.Document,
      parentId,
      title: option.publication.title,
    })
    setBookPickerTarget(undefined)
    toast.success(t('bookTopicCreated', { ns: 'editor' }))
  }, [t])

  const handleCreateEntry = useCallback((target: EntryCreationTarget, label: string) => {
    const note = noteRef.current
    if (!note)
      throw new Error('The Note is no longer open')
    if (target.kind === 'folder') {
      note.createFolder({ name: label, parentId: target.parentId })
    }
    else {
      note.createTopic({ mode: EditorMode.Document, parentId: target.parentId, title: label })
    }
    setEntryCreationTarget(undefined)
  }, [])

  const handleRebindBookTopic = useCallback(async (
    option: ShelfBookOption,
    format: ShelfReadingFormat,
    topicId: string,
  ) => {
    const note = noteRef.current
    if (!note)
      throw new Error('The Note is no longer open')
    const bookTopic = note.getBookTopic(topicId)
    const currentBook = bookTopic.getBook()
    if (format !== currentBook.file.format)
      throw new Error(`BookTopic format must remain ${currentBook.file.format}`)
    const prepared = await window.desktop.prepareShelfReading({
      format,
      publicationId: option.publication.id,
      retention: 'library',
      sourceId: option.source.id,
    })
    bookTopic.rebind(prepared.book)
    setBookPickerTarget(undefined)
    toast.warning(t('bookTopicRebound', { ns: 'editor' }))
  }, [t])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active)
        resetViewState()
    })

    void window.desktop.getNote({ noteId }).then(async (stored) => {
      if (!active)
        return
      const note = createEditorNote({
        id: stored.id,
        snapshot: stored.snapshot,
        title: stored.title,
      })
      getPendingChanges()
        .forEach(change => note.importUpdates(change.update))
      if (!active)
        return

      for (const entry of note.getEntries()) {
        if (entry.kind === 'topic')
          await Effect.runPromise(note.validateTopic(entry.id))
      }
      if (!active)
        return

      const entries = note.getEntries()
      const topic = entries.find(entry => entry.kind === 'topic' && entry.id === topicId)
      if (!topic)
        throw new Error(`Note ${note.id} does not contain Topic ${topicId}`)
      await window.desktop.recordNoteOpened({ noteId: note.id, topicId: topic.id })
      if (!active)
        return
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
      noteRef.current = note
      storedRef.current = stored
      latestValidSnapshotRef.current = note.exportSnapshot()
      unsubscribeRef.current = note.subscribe(handleNoteChange)
      setOpened({
        entries,
        note,
        stored,
        topic: note.getTopic(topic.id),
      })
    }, (error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    }).catch((error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      active = false
      unsubscribeRef.current?.()
      unsubscribeRef.current = undefined
      noteRef.current = null
      storedRef.current = null
      latestValidSnapshotRef.current = null
    }
  }, [getPendingChanges, handleNoteChange, noteId, queryClient, resetViewState, topicId])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage, editorRouteStyles.errorMessage)} role="alert">
          {t('failedToOpenNote', { message: loadError })}
        </p>
      </main>
    )
  }
  if (!opened) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">{t('openingNote')}</p>
      </main>
    )
  }

  return (
    <>
      <OpenedTopicEditor
        collapsedEntryIds={collapsedEntryIds}
        favoritePending={favoritePending}
        focusBlockId={focusBlockId}
        onAddBook={parentId => setBookPickerTarget({ kind: 'create', parentId })}
        onAddFolder={parentId => setEntryCreationTarget({ kind: 'folder', parentId })}
        onAddTopic={parentId => setEntryCreationTarget({ kind: 'topic', parentId })}
        onRebindBook={(topicId) => {
          const format = opened.note.getBookTopic(topicId).getBook().file.format
          setBookPickerTarget({ format, kind: 'rebind', topicId })
        }}
        onRenameNote={handleRenameNote}
        onToggleEntry={onToggleEntry}
        onToggleFavorite={handleToggleFavorite}
        opened={opened}
        saveError={persistence.error instanceof Error
          ? persistence.error.message
          : persistence.error === null ? null : String(persistence.error)}
        validationError={validationError}
      />
      {bookPickerTarget !== undefined
        ? (
            <BookTopicPickerDialog
              mode={bookPickerTarget.kind}
              requiredFormat={bookPickerTarget.kind === 'rebind' ? bookPickerTarget.format : undefined}
              onClose={() => setBookPickerTarget(undefined)}
              onCreate={(option, format) => bookPickerTarget.kind === 'create'
                ? handleCreateBookTopic(option, format, bookPickerTarget.parentId)
                : handleRebindBookTopic(option, format, bookPickerTarget.topicId)}
            />
          )
        : null}
      {entryCreationTarget !== undefined
        ? (
            <EntryCreationDialog
              kind={entryCreationTarget.kind}
              onClose={() => setEntryCreationTarget(undefined)}
              onCreate={label => handleCreateEntry(entryCreationTarget, label)}
            />
          )
        : null}
    </>
  )
}
