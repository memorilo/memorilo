import type { StoredNote } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type {
  InitializeBookReaderNoteInput,
  ReaderCaptureRegionInput,
  ReaderImageSize,
  ReaderSurfaceCommand,
  ReaderSurfaceCommandResult,
  ReaderSurfaceDocument,
  ReaderSurfaceTopicInput,
  SaveReaderImageInput,
  SaveReaderNoteInput,
} from './reader-surface-contract'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { MobileReading } from '@/files/mobile-reading-library'
import { sameBookFile } from '@memorilo/reading-model'
import { File } from 'expo-file-system'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Image, StyleSheet, Text, View } from 'react-native'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import { useMobileLanguage } from '@/application/mobile-language-hook'
import { colors } from '@/ui/theme'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import ReaderDomSurface from './reader-dom-surface'

export interface ReaderDomHostProps {
  onOpenTopic?: (input: ReaderSurfaceTopicInput) => void
  reading: MobileReading
  runtime: MobileRuntime
}

interface PendingReaderCommand {
  id: number
  reject: (error: Error) => void
  resolve: () => void
}

const initializeBookNoteMessage = 'memorilo.reader.initialize-book-note'

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  root: {
    flex: 1,
  },
})

function toSurfaceSession(note: StoredNote) {
  return {
    checkpointSequence: note.checkpointSequence,
    id: note.id,
    latestSequence: note.latestSequence,
    snapshot: note.snapshot === null ? null : encodeBinary(note.snapshot),
    title: note.title,
    updates: note.updates.map(update => encodeBinary(update.update)),
  }
}

async function nextBookNoteTitle(runtime: MobileRuntime, bookTitle: string): Promise<string> {
  const titles = new Set<string>()
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const result = await runtime.editor.notes.listNotes({ page, pageSize: 100 })
    result.items.forEach(note => titles.add(note.title.toLocaleLowerCase()))
    totalPages = result.totalPages
    page += 1
  }
  if (!titles.has(bookTitle.toLocaleLowerCase()))
    return bookTitle
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${bookTitle} (${suffix})`
    if (!titles.has(candidate.toLocaleLowerCase()))
      return candidate
  }
  throw new Error(`Unable to allocate a Note title for ${bookTitle}`)
}

async function loadSurfaceDocument(
  runtime: MobileRuntime,
  reading: MobileReading,
): Promise<ReaderSurfaceDocument> {
  const base = {
    byteLength: reading.byteLength,
    fileUri: reading.uri,
    format: reading.format,
    name: reading.name,
    originalName: reading.originalName,
    readingId: reading.id,
  }
  if (reading.noteId !== null && reading.topicId !== null) {
    const note = await runtime.editor.notes.getNote({ noteId: reading.noteId })
    return { ...base, kind: 'bound', note: toSurfaceSession(note), topicId: reading.topicId }
  }
  if (reading.sha256 !== null) {
    const contexts = await runtime.editor.bookTopics.listByReadingId(reading.id)
    if (contexts.length > 1)
      throw new Error(`Mobile reading ${reading.id} is bound to multiple Book Topics`)
    const recovered = contexts[0]
    if (recovered) {
      if (!sameBookFile(recovered.book.file, { format: reading.format, sha256: reading.sha256 }))
        throw new Error(`Mobile reading ${reading.id} has a mismatched Book Topic binding`)
      await runtime.readings.bindContext({
        noteId: recovered.noteId,
        readingId: reading.id,
        topicId: recovered.topicId,
      })
      const note = await runtime.editor.notes.getNote({ noteId: recovered.noteId })
      return { ...base, kind: 'bound', note: toSurfaceSession(note), topicId: recovered.topicId }
    }
    const book = reading.book ?? {
      book: { authors: [], title: reading.name },
      file: {
        byteLength: reading.byteLength,
        format: reading.format,
        originalName: reading.originalName,
        sha256: reading.sha256,
      },
      retrievalHints: [{ kind: 'local' as const, readingId: reading.id }],
    }
    return {
      ...base,
      book,
      kind: 'unbound',
      noteTitle: await nextBookNoteTitle(runtime, reading.name),
    }
  }
  return {
    ...base,
    annotations: reading.annotations,
    kind: 'legacy',
    position: reading.position,
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function isInitializeBookReaderNoteInput(value: unknown): value is InitializeBookReaderNoteInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const input = value as Record<string, unknown>
  return typeof input.noteId === 'string'
    && typeof input.readingId === 'string'
    && typeof input.snapshot === 'string'
    && typeof input.title === 'string'
    && typeof input.topicId === 'string'
    && Array.isArray(input.entries)
    && Array.isArray(input.learningCards)
    && Array.isArray(input.spreadsheets)
    && Array.isArray(input.topics)
}

function readNativeImageSize(source: string): Promise<ReaderImageSize> {
  return new Promise((resolve, reject) => {
    Image.getSize(source, (width, height) => {
      if (width <= 0 || height <= 0) {
        reject(new Error(`Image ${source} has invalid dimensions`))
        return
      }
      resolve({ height, width })
    }, reject)
  })
}

function validateCaptureRegion(input: ReaderCaptureRegionInput): void {
  if (![input.x, input.y, input.width, input.height].every(Number.isFinite))
    throw new TypeError('Reader capture region must contain finite coordinates')
  if (input.x < 0 || input.y < 0 || input.width <= 0 || input.height <= 0)
    throw new RangeError('Reader capture region must be positive and inside the Reader surface')
}

export function ReaderDomHost({ onOpenTopic, reading, runtime }: ReaderDomHostProps) {
  const { language } = useMobileLanguage()
  const captureTargetRef = useRef<View>(null)
  const captureLayoutRef = useRef({ height: 0, width: 0 })
  const [document, setDocument] = useState<ReaderSurfaceDocument | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [command, setCommand] = useState<ReaderSurfaceCommand | null>(null)
  const nextCommandId = useRef(1)
  const pendingCommand = useRef<PendingReaderCommand | null>(null)
  const commandQueue = useRef<Promise<void>>(Promise.resolve())
  const activeReadingId = useRef(reading.id)
  const initializations = useRef(new Map<string, Promise<void>>())
  activeReadingId.current = reading.id

  useEffect(() => {
    runtime.readings.beginSession(reading.id)
    return () => runtime.readings.endSession(reading.id)
  }, [reading.id, runtime])

  const issueCommand = useCallback(() => {
    if (pendingCommand.current)
      throw new Error('A Reader command is already running')
    const id = nextCommandId.current++
    return new Promise<void>((resolve, reject) => {
      pendingCommand.current = { id, reject, resolve }
      setCommand({ id, type: 'flush' })
    })
  }, [])

  const enqueueFlush = useCallback(() => {
    const result = commandQueue.current.then(issueCommand)
    commandQueue.current = result.catch(() => undefined)
    return result
  }, [issueCommand])

  useEffect(() => {
    // React Native AppState returns a subscription whose remove method is called below.
    // eslint-disable-next-line react-web-api/no-leaked-event-listener
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active')
        void enqueueFlush().catch(() => undefined)
    })
    return () => subscription.remove()
  }, [enqueueFlush])

  useEffect(() => () => {
    pendingCommand.current?.reject(new Error('Reader surface closed before the command completed'))
    pendingCommand.current = null
  }, [])

  const onCommandResult = useCallback((result: ReaderSurfaceCommandResult) => {
    const pending = pendingCommand.current
    if (!pending || pending.id !== result.commandId)
      return
    pendingCommand.current = null
    setCommand(null)
    if (result.error !== undefined) {
      pending.reject(new Error(result.error))
      return
    }
    pending.resolve()
  }, [])

  useEffect(() => {
    let active = true
    void loadSurfaceDocument(runtime, reading).then(
      (loaded) => {
        if (active)
          setDocument(loaded)
      },
      (failure: unknown) => {
        if (active)
          setError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [reading, runtime])

  const saveState = useCallback((input: Parameters<typeof runtime.readings.saveState>[0]) => (
    runtime.readings.saveState(input)
  ), [runtime])

  const saveNote = useCallback(async (input: SaveReaderNoteInput): Promise<void> => {
    await runtime.editor.notes.saveNoteUpdates({
      entries: input.entries,
      learningCards: input.learningCards,
      noteId: input.noteId,
      spreadsheets: input.spreadsheets,
      title: input.title,
      topics: input.topics,
      updates: input.updates.map(decodeBinary),
    })
  }, [runtime])

  const initializeBookNote = useCallback((input: InitializeBookReaderNoteInput): void => {
    const key = `${input.readingId}:${input.noteId}`
    if (initializations.current.has(key))
      return
    const initialization = (async () => {
      const retained = await runtime.readings.retainInLibrary(input.readingId)
      if (!retained)
        throw new Error(`Reading file ${input.readingId} is no longer available`)
      await runtime.editor.notes.createInitializedNote({
        entries: input.entries,
        id: input.noteId,
        learningCards: input.learningCards,
        snapshot: decodeBinary(input.snapshot),
        spreadsheets: input.spreadsheets,
        title: input.title,
        topics: input.topics,
      })
      await runtime.readings.bindContext({
        noteId: input.noteId,
        readingId: input.readingId,
        topicId: input.topicId,
      })
      const loaded = await loadSurfaceDocument(runtime, runtime.readings.get(input.readingId))
      if (activeReadingId.current === input.readingId)
        setDocument(loaded)
    })()
    initializations.current.set(key, initialization)
    void initialization.catch((failure: unknown) => {
      if (activeReadingId.current === input.readingId)
        setError(toError(failure))
    }).finally(() => {
      initializations.current.delete(key)
    })
  }, [runtime])

  const readerDom = useMemo<DOMProps>(() => ({
    style: { flex: 1 },
    unstable_useExpoModulesBridge: true,
    onMessage: (event) => {
      try {
        const message: unknown = JSON.parse(event.nativeEvent.data)
        if (message === null || typeof message !== 'object' || Array.isArray(message))
          return
        const { data, type } = message as Record<string, unknown>
        if (type !== initializeBookNoteMessage)
          return
        if (!isInitializeBookReaderNoteInput(data))
          throw new TypeError('Reader Book Note initialization message is invalid')
        initializeBookNote(data)
      }
      catch (failure) {
        setError(toError(failure))
      }
    },
  }), [initializeBookNote])

  const resolveAsset = useCallback((source: string) => runtime.assets.resolve(source), [runtime])
  const saveImage = useCallback(async (input: SaveReaderImageInput) => (
    runtime.assets.saveImage({
      data: decodeBinary(input.data),
      fileName: input.fileName,
      mimeType: input.mimeType,
    })
  ), [runtime])
  const readImageSize = useCallback(async (source: string) => (
    readNativeImageSize(await runtime.assets.resolve(source))
  ), [runtime])
  const captureReaderRegion = useCallback(async (input: ReaderCaptureRegionInput): Promise<string> => {
    validateCaptureRegion(input)
    const target = captureTargetRef.current
    const layout = captureLayoutRef.current
    if (!target || layout.width <= 0 || layout.height <= 0)
      throw new Error('Reader surface is not ready for region capture')

    const screenshotUri = await captureRef(target, {
      format: 'png',
      handleGLSurfaceViewOnAndroid: true,
      quality: 1,
      result: 'tmpfile',
    })
    let croppedUri: string | null = null
    try {
      const screenshot = await readNativeImageSize(screenshotUri)
      const scaleX = screenshot.width / layout.width
      const scaleY = screenshot.height / layout.height
      const originX = Math.min(screenshot.width - 1, Math.max(0, Math.floor(input.x * scaleX)))
      const originY = Math.min(screenshot.height - 1, Math.max(0, Math.floor(input.y * scaleY)))
      const width = Math.min(
        screenshot.width - originX,
        Math.max(1, Math.ceil(input.width * scaleX)),
      )
      const height = Math.min(
        screenshot.height - originY,
        Math.max(1, Math.ceil(input.height * scaleY)),
      )
      const cropped = await manipulateAsync(screenshotUri, [{
        crop: { height, originX, originY, width },
      }], {
        base64: true,
        compress: 1,
        format: SaveFormat.PNG,
      })
      croppedUri = cropped.uri
      if (!cropped.base64)
        throw new Error('Reader region capture did not return PNG data')
      return cropped.base64
    }
    finally {
      if (croppedUri !== null) {
        const croppedFile = new File(croppedUri)
        if (croppedFile.exists)
          croppedFile.delete()
      }
      releaseCapture(screenshotUri)
    }
  }, [])

  if (error) {
    return (
      <View style={styles.centered}>
        <Text selectable style={styles.error}>{error.message}</Text>
      </View>
    )
  }
  if (!document) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }
  return (
    <View
      ref={captureTargetRef}
      collapsable={false}
      style={styles.root}
      onLayout={(event) => {
        captureLayoutRef.current = event.nativeEvent.layout
      }}
    >
      <ReaderDomSurface
        captureReaderRegion={captureReaderRegion}
        command={command}
        document={document}
        dom={readerDom}
        language={language}
        readImageSize={readImageSize}
        resolveAsset={resolveAsset}
        saveImage={saveImage}
        saveNote={saveNote}
        saveState={saveState}
        onCommandResult={onCommandResult}
        onOpenTopic={onOpenTopic}
      />
    </View>
  )
}
