import type { EditorProps } from './editor'
import type { EditorNote } from './note/editor-note'
import { useMemo } from 'react'
import { Editor } from './editor'
import { resolveJournalTopic } from './note/journal-note'

export type JournalEditorProps = Omit<EditorProps, 'layout' | 'topic'> & {
  /** The date heading and all Note-level controls remain owned by the Journal feed. */
  note: EditorNote
}

/** Edits the single unnamed root Topic of a Journal inside its outer virtualized scroller. */
export function JournalEditor({ note, ...props }: JournalEditorProps) {
  const topic = useMemo(() => resolveJournalTopic(note), [note])
  return <Editor {...props} layout="embedded" topic={topic} />
}
