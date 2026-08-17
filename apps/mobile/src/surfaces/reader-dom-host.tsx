import type { StoredNote } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type {
  InitializeBookReaderNoteInput,
  ReaderSurfaceDocument,
  SaveReaderNoteInput,
} from './reader-surface-contract'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { MobileReading } from '@/files/mobile-reading-library'
import { sameBookFile } from '@memorilo/reading-model'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/ui/theme'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import ReaderDomSurface from './reader-dom-surface'

export interface ReaderDomHostProps {
  reading: MobileReading
  runtime: MobileRuntime
}

const dom: DOMProps = {
  style: { flex: 1 },
}

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
    return {
      ...base,
      kind: 'unbound',
      noteTitle: await nextBookNoteTitle(runtime, reading.name),
      sha256: reading.sha256,
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

export function ReaderDomHost({ reading, runtime }: ReaderDomHostProps) {
  const [document, setDocument] = useState<ReaderSurfaceDocument | null>(null)
  const [error, setError] = useState<Error | null>(null)

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

  const readRange = useCallback(async (input: { length: number, offset: number, readingId: string }) => (
    encodeBinary(await runtime.readings.readRange(input.readingId, input.offset, input.length))
  ), [runtime])

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

  const initializeBookNote = useCallback(async (input: InitializeBookReaderNoteInput): Promise<void> => {
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
  }, [runtime])

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
    <View style={styles.root}>
      <ReaderDomSurface
        document={document}
        dom={dom}
        initializeBookNote={initializeBookNote}
        readRange={readRange}
        saveNote={saveNote}
        saveState={saveState}
      />
    </View>
  )
}
