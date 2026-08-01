import type { ReaderSource } from '@memorilo/editor/reader'
import type { ChangeEvent } from 'react'
import { Reader } from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { BookOpen, FolderOpen } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { readerRouteStyles } from './-reader.stylex'

function ReaderRoute() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const titlebar = useMemo(() => ({ title: file?.name ?? 'Reader' }), [file?.name])
  usePageTitlebar(titlebar)

  const source = useMemo<ReaderSource | null>(() => file
    ? { data: file, name: file.name }
    : null, [file])
  const selectFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }, [])

  return (
    <main {...stylex.props(readerRouteStyles.page)}>
      <input
        ref={inputRef}
        {...stylex.props(readerRouteStyles.fileInput)}
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        aria-label="Open PDF or EPUB"
        type="file"
        onChange={selectFile}
      />
      {source
        ? (
            <>
              <button
                {...stylex.props(readerRouteStyles.openButton, readerRouteStyles.reopenButton)}
                data-window-no-drag=""
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <FolderOpen aria-hidden="true" size={15} strokeWidth={1.9} />
                Open
              </button>
              <Reader source={source} />
            </>
          )
        : (
            <section {...stylex.props(readerRouteStyles.empty)}>
              <BookOpen {...stylex.props(readerRouteStyles.emptyIcon)} aria-hidden="true" strokeWidth={1.5} />
              <h1 {...stylex.props(readerRouteStyles.emptyTitle)}>Open a document</h1>
              <p {...stylex.props(readerRouteStyles.emptyDetail)}>
                Choose a PDF or EPUB from this Mac.
              </p>
              <button
                {...stylex.props(readerRouteStyles.openButton)}
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <FolderOpen aria-hidden="true" size={15} strokeWidth={1.9} />
                Open File
              </button>
            </section>
          )}
    </main>
  )
}

export const Route = createFileRoute('/reader')({ component: ReaderRoute })
