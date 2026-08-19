'use dom'

import type { SupportedLanguage } from '@memorilo/config'
import type { EditorNote } from '@memorilo/editor/note'
import type {
  ReaderAnnotation,
  ReaderAnnotationTopicCreateInput,
  ReaderPosition,
  ReaderSource,
} from '@memorilo/editor/reader'
import type { DOMProps } from 'expo/dom'
import type {
  BoundReaderSurfaceDocument,
  InitializeBookReaderNoteInput,
  LegacyReaderSurfaceDocument,
  ReaderSurfaceCommand,
  ReaderSurfaceCommandResult,
  ReaderSurfaceDocument,
  ReaderSurfaceFunctions,
  ReaderSurfaceTopicInput,
  UnboundReaderSurfaceDocument,
} from './reader-surface-contract'
import { createBookEditorNote } from '@memorilo/application'
import { createBoundReaderSession } from '@memorilo/application/bound-reader'
import { projectEditorNoteStorage } from '@memorilo/application/note-storage'
import { createReaderAnnotationTopic } from '@memorilo/application/reader-annotation-topics'
import { captureReaderAnnotationRegion } from '@memorilo/application/reader-capture'
import { openReaderRegionImageOcclusion } from '@memorilo/application/reader-image-occlusion'
import { BoundReaderSurface, createEditorNote } from '@memorilo/editor'
import {
  prepareReaderAnnotationTopicsForDeletion,
  Reader,
  readerAnnotationDependents,
} from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ensureDomRuntimePolyfills } from './dom-runtime-polyfills'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import { initEditorSurfaceI18n } from './editor-surface-i18n'
import { MobileAssetSourceRewriter } from './mobile-asset-source-rewriter'
import { createMobileEditorAdapters } from './mobile-editor-adapters'
import { readerDomSurfaceStyles as styles } from './reader-dom-surface.stylex'

ensureDomRuntimePolyfills()

export interface ReaderDomSurfaceProps extends ReaderSurfaceFunctions {
  command?: ReaderSurfaceCommand | null
  document: ReaderSurfaceDocument
  dom?: DOMProps
  language: SupportedLanguage
  onCommandResult: (result: ReaderSurfaceCommandResult) => void
  onOpenTopic?: (input: ReaderSurfaceTopicInput) => void
}

const saveDelayMilliseconds = 350
const initializeBookNoteMessage = 'memorilo.reader.initialize-book-note'

interface ExpoFileSystemBridge {
  readAsStringAsync: (
    uri: string,
    options: { encoding: 'base64', length: number, position: number },
  ) => Promise<string>
}

interface ExpoDomWebViewBridge {
  expoModulesProxy?: {
    ExponentFileSystem?: ExpoFileSystemBridge
  }
}

function requireFileSystemBridge(): ExpoFileSystemBridge {
  const bridge = (globalThis as typeof globalThis & {
    ExpoDomWebView?: ExpoDomWebViewBridge
  }).ExpoDomWebView?.expoModulesProxy?.ExponentFileSystem
  if (!bridge)
    throw new Error('The native Reader file bridge is unavailable')
  return bridge
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function requestBookNoteInitialization(input: InitializeBookReaderNoteInput): void {
  const bridge = (globalThis as typeof globalThis & {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }).ReactNativeWebView
  if (!bridge)
    throw new Error('The native Reader message bridge is unavailable')
  bridge.postMessage(JSON.stringify({ data: input, type: initializeBookNoteMessage }))
}

function openEditorNote(document: BoundReaderSurfaceDocument): EditorNote {
  return createEditorNote({
    id: document.note.id,
    snapshot: document.note.snapshot === null ? null : decodeBinary(document.note.snapshot),
    title: document.note.title,
    updates: document.note.updates.map(decodeBinary),
  })
}

function resolveBookTopicId(note: EditorNote, document: ReaderSurfaceDocument): string {
  if (document.kind === 'bound')
    return document.topicId
  const entry = note.getEntries().find(candidate => (
    candidate.kind === 'topic' && candidate.topicType === 'book'
  ))
  if (!entry)
    throw new Error(`Book Note ${note.id} does not contain a BookTopic`)
  return entry.id
}

function useReaderSource(
  document: ReaderSurfaceDocument,
): ReaderSource {
  return useMemo<ReaderSource>(() => ({
    byteLength: document.byteLength,
    format: document.format,
    name: document.name,
    read: async (offset, length) => {
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new RangeError('Reading range offset must be a non-negative safe integer')
      if (!Number.isSafeInteger(length) || length < 0)
        throw new RangeError('Reading range length must be a non-negative safe integer')
      if (offset + length > document.byteLength)
        throw new RangeError(`Reading range exceeds ${document.name}`)
      return decodeBinary(await requireFileSystemBridge().readAsStringAsync(document.fileUri, {
        encoding: 'base64',
        length,
        position: offset,
      }))
    },
  }), [document.byteLength, document.fileUri, document.format, document.name])
}

function LegacyReader({
  command,
  document,
  onCommandResult,
  saveState,
}: {
  command?: ReaderSurfaceCommand | null
  document: LegacyReaderSurfaceDocument
  onCommandResult: (result: ReaderSurfaceCommandResult) => void
  saveState: ReaderSurfaceFunctions['saveState']
}) {
  const source = useReaderSource(document)
  const annotationsRef = useRef(document.annotations)
  const positionRef = useRef<ReaderPosition | null>(document.position)
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve())
  const persistenceResultRef = useRef<Promise<void>>(Promise.resolve())
  const persist = useCallback(() => {
    const input = {
      annotations: annotationsRef.current,
      position: positionRef.current,
      readingId: document.readingId,
    }
    const result = persistenceQueueRef.current.then(() => saveState(input))
    persistenceResultRef.current = result
    persistenceQueueRef.current = result.catch(() => undefined)
    return result
  }, [document.readingId, saveState])
  useEffect(() => {
    if (!command)
      return
    void persistenceResultRef.current.then(
      () => onCommandResult({ commandId: command.id }),
      (failure: unknown) => onCommandResult({ commandId: command.id, error: toError(failure).message }),
    )
  }, [command, onCommandResult])
  return (
    <Reader
      annotationEditingEnabled
      defaultAnnotations={document.annotations}
      initialPosition={document.position}
      source={source}
      title={document.name}
      onAnnotationsChange={(annotations) => {
        annotationsRef.current = annotations
        void persist()
      }}
      onPositionChange={(position) => {
        positionRef.current = position
        void persist()
      }}
    />
  )
}

function BoundReader({
  captureReaderRegion,
  command,
  document,
  note,
  onCommandResult,
  onOpenTopic,
  readImageSize,
  resolveAsset,
  saveImage,
  saveNote,
}: {
  captureReaderRegion: ReaderSurfaceFunctions['captureReaderRegion']
  command?: ReaderSurfaceCommand | null
  document: ReaderSurfaceDocument
  note: EditorNote
  onCommandResult: (result: ReaderSurfaceCommandResult) => void
  onOpenTopic?: (input: ReaderSurfaceTopicInput) => void
  readImageSize: ReaderSurfaceFunctions['readImageSize']
  resolveAsset: ReaderSurfaceFunctions['resolveAsset']
  saveImage: ReaderSurfaceFunctions['saveImage']
  saveNote: ReaderSurfaceFunctions['saveNote']
}) {
  const source = useReaderSource(document)
  const topicId = resolveBookTopicId(note, document)
  const readerSession = useMemo(() => createBoundReaderSession(note, topicId), [note, topicId])
  const { bookTopic } = readerSession
  const initialState = useRef(readerSession.initialReadingState).current
  const initialAnnotations = useRef(readerSession.initialAnnotations).current
  const [annotations, setAnnotations] = useState(initialAnnotations)
  const [, setNoteVersion] = useState(0)
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)
  const annotationsRef = useRef(initialAnnotations)
  const positionRef = useRef(initialState.position)
  const saveNoteRef = useRef(saveNote)
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const editorAdapters = useMemo(() => createMobileEditorAdapters(saveImage), [saveImage])
  const learningEnabled = note.getLearningEnabled()
  saveNoteRef.current = saveNote

  useEffect(() => {
    let active = true
    let timer: number | null = null
    let pending: string[] = []
    let drain: Promise<void> | null = null

    const flush = (): Promise<void> => {
      if (drain)
        return drain
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      drain = (async () => {
        while (pending.length > 0) {
          const updates = pending
          pending = []
          try {
            await saveNoteRef.current({
              ...projectEditorNoteStorage(note),
              noteId: note.id,
              title: note.getTitle(),
              updates,
            })
            if (active)
              setPersistenceError(null)
          }
          catch (error) {
            pending = [...updates, ...pending]
            const failure = toError(error)
            if (active)
              setPersistenceError(failure)
            throw failure
          }
        }
      })().finally(() => {
        drain = null
      })
      return drain
    }
    flushRef.current = flush

    const schedule = (): void => {
      if (timer !== null)
        window.clearTimeout(timer)
      timer = window.setTimeout(() => void flush().catch(() => undefined), saveDelayMilliseconds)
    }

    const syncProjection = (): void => {
      const next = readerSession.project()
      positionRef.current = next.position
      annotationsRef.current = next.annotations
      setAnnotations(next.annotations)
      setNoteVersion(version => version + 1)
      if (next.annotations !== next.readingState.annotations)
        bookTopic.setAnnotations(next.annotations)
    }

    const unsubscribe = note.subscribe((change) => {
      pending.push(encodeBinary(change.update))
      syncProjection()
      schedule()
    })
    if (initialAnnotations !== initialState.annotations)
      bookTopic.setAnnotations(initialAnnotations)

    return () => {
      active = false
      unsubscribe()
      if (timer !== null)
        window.clearTimeout(timer)
      void flush().catch(() => undefined)
      flushRef.current = async () => undefined
    }
  }, [bookTopic, initialAnnotations, initialState.annotations, note, readerSession, topicId])

  useEffect(() => {
    if (!command)
      return
    void flushRef.current().then(
      () => onCommandResult({ commandId: command.id }),
      (failure: unknown) => onCommandResult({ commandId: command.id, error: toError(failure).message }),
    )
  }, [command, onCommandResult])

  const onPositionChange = useCallback((position: ReaderPosition) => {
    if (JSON.stringify(position) !== JSON.stringify(positionRef.current))
      bookTopic.setPosition(position)
  }, [bookTopic])
  const onAnnotationsChange = useCallback((next: readonly ReaderAnnotation[]) => {
    if (JSON.stringify(next) !== JSON.stringify(annotationsRef.current))
      bookTopic.setAnnotations(next)
  }, [bookTopic])
  const captureAnnotationRegion = useCallback((region: Parameters<typeof captureReaderAnnotationRegion>[0]['region']) => (
    captureReaderAnnotationRegion({
      captureReaderRegion: async current => decodeBinary(await captureReaderRegion(current)),
      region,
    })
  ), [captureReaderRegion])
  const createAnnotationTopic = useCallback((input: ReaderAnnotationTopicCreateInput, signal: AbortSignal) => (
    createReaderAnnotationTopic({
      bookTopicId: topicId,
      captureReaderRegion: captureAnnotationRegion,
      createTopic: note.createTopic,
      input,
      saveImage: async image => saveImage({
        data: encodeBinary(image.data),
        fileName: image.fileName,
        mimeType: image.mimeType,
      }),
      signal,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })
  ), [captureAnnotationRegion, note, saveImage, topicId])
  const getAnnotationDependents = useCallback(
    (annotation: ReaderAnnotation) => readerAnnotationDependents(note, topicId, annotation),
    [note, topicId],
  )
  const prepareAnnotationDeletion = useCallback(async (annotation: ReaderAnnotation) => {
    prepareReaderAnnotationTopicsForDeletion(note, topicId, annotation)
  }, [note, topicId])
  const openImageOcclusion = useCallback(async (
    input: ReaderAnnotationTopicCreateInput,
    signal: AbortSignal,
  ) => {
    if (!learningEnabled)
      throw new Error('Learning features are disabled')
    await openReaderRegionImageOcclusion({
      bookTopicId: topicId,
      captureReaderRegion: captureAnnotationRegion,
      input,
      note,
      readImageSize,
      saveImage: async image => saveImage({
        data: encodeBinary(image.data),
        fileName: image.fileName,
        mimeType: image.mimeType,
      }),
      signal,
      title: i18next.t('imageOcclusion.defaultTitle', { ns: 'editor' }),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })
  }, [captureAnnotationRegion, learningEnabled, note, readImageSize, saveImage, topicId])

  return (
    <>
      <MobileAssetSourceRewriter resolveAsset={resolveAsset} />
      {persistenceError
        ? <div {...stylex.props(styles.alert)} role="alert">{persistenceError.message}</div>
        : null}
      <BoundReaderSurface
        adapters={editorAdapters}
        annotationCopyBookTitle={document.name}
        annotationEditingEnabled
        annotations={annotations}
        currentTopicId={topicId}
        imageOcclusionEnabled={learningEnabled}
        initialPosition={readerSession.initialPosition}
        learningEnabled={learningEnabled}
        note={note}
        onCreateAnnotationTopic={createAnnotationTopic}
        onGetAnnotationDependents={getAnnotationDependents}
        onOpenReaderRegionImageOcclusion={learningEnabled ? openImageOcclusion : undefined}
        onOpenTopic={topicId => onOpenTopic?.({ noteId: note.id, topicId })}
        onPrepareAnnotationDeletion={prepareAnnotationDeletion}
        source={source}
        title={document.name}
        onAnnotationsChange={onAnnotationsChange}
        onPositionChange={onPositionChange}
      />
    </>
  )
}

function RestoredBookReader({
  command,
  document,
  onCommandResult,
  onOpenTopic,
  ...functions
}: ReaderSurfaceFunctions & {
  command?: ReaderSurfaceCommand | null
  document: BoundReaderSurfaceDocument
  onCommandResult: (result: ReaderSurfaceCommandResult) => void
  onOpenTopic?: (input: ReaderSurfaceTopicInput) => void
}) {
  const revision = `${document.note.id}:${document.note.checkpointSequence}:${document.note.latestSequence}`
  const openedRef = useRef<{ note: EditorNote, revision: string } | null>(null)
  if (openedRef.current?.revision !== revision)
    openedRef.current = { note: openEditorNote(document), revision }
  const note = openedRef.current.note
  return <BoundReader command={command} document={document} note={note} onCommandResult={onCommandResult} onOpenTopic={onOpenTopic} {...functions} />
}

function InitializedBookReader({
  document,
}: ReaderSurfaceFunctions & {
  command?: ReaderSurfaceCommand | null
  document: UnboundReaderSurfaceDocument
  onCommandResult: (result: ReaderSurfaceCommandResult) => void
  onOpenTopic?: (input: ReaderSurfaceTopicInput) => void
}) {
  const createdRef = useRef<{
    created: ReturnType<typeof createBookEditorNote>
    readingId: string
  } | null>(null)
  if (createdRef.current?.readingId !== document.readingId) {
    createdRef.current = {
      created: createBookEditorNote({
        book: document.book,
        id: crypto.randomUUID(),
        learningEnabled: true,
        noteTitle: document.noteTitle,
        topicTitle: document.name,
      }),
      readingId: document.readingId,
    }
  }
  const created = createdRef.current.created
  const initializationRef = useRef<string | null>(null)

  useEffect(() => {
    const key = `${created.note.id}:${document.readingId}`
    if (initializationRef.current === key)
      return
    initializationRef.current = key
    requestBookNoteInitialization({
      ...projectEditorNoteStorage(created.note),
      noteId: created.note.id,
      readingId: document.readingId,
      snapshot: encodeBinary(created.note.exportSnapshot()),
      title: created.note.getTitle(),
      topicId: created.topicId,
    })
  }, [created, document.readingId])

  return <div aria-busy="true" />
}

export default function ReaderDomSurface(props: ReaderDomSurfaceProps) {
  const [i18nReady, setI18nReady] = useState(false)

  useEffect(() => {
    let active = true
    void initEditorSurfaceI18n(i18next, props.language).then(() => {
      if (active)
        setI18nReady(true)
    })
    return () => {
      active = false
    }
  }, [props.language])

  if (!i18nReady)
    return null
  return (
    <I18nextProvider i18n={i18next}>
      <main {...stylex.props(styles.root)}>
        {props.document.kind === 'legacy'
          ? (
              <LegacyReader
                command={props.command}
                document={props.document}
                onCommandResult={props.onCommandResult}
                saveState={props.saveState}
              />
            )
          : props.document.kind === 'bound'
            ? (
                <RestoredBookReader
                  captureReaderRegion={props.captureReaderRegion}
                  command={props.command}
                  document={props.document}
                  readImageSize={props.readImageSize}
                  resolveAsset={props.resolveAsset}
                  saveImage={props.saveImage}
                  saveNote={props.saveNote}
                  onCommandResult={props.onCommandResult}
                  onOpenTopic={props.onOpenTopic}
                  saveState={props.saveState}
                />
              )
            : (
                <InitializedBookReader
                  captureReaderRegion={props.captureReaderRegion}
                  command={props.command}
                  document={props.document}
                  readImageSize={props.readImageSize}
                  resolveAsset={props.resolveAsset}
                  saveImage={props.saveImage}
                  saveNote={props.saveNote}
                  onCommandResult={props.onCommandResult}
                  onOpenTopic={props.onOpenTopic}
                  saveState={props.saveState}
                />
              )}
      </main>
    </I18nextProvider>
  )
}
