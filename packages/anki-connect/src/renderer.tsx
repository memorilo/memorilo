import type { AnkiCardMedia, AnkiRenderableCard } from './model'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { renderAnkiCardDocument } from './media'

const styles = stylex.create({
  frame: {
    display: 'block',
    width: '100%',
    minHeight: 120,
    border: 0,
    backgroundColor: 'transparent',
  },
  surface: {
    display: 'grid',
    gap: 9,
  },
  side: {
    minHeight: 120,
    overflow: 'hidden',
    borderColor: 'rgba(37, 43, 52, 0.12)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'rgb(255, 255, 255)',
  },
})

function NoteFrame({ card, html, label, media }: { card: AnkiRenderableCard, html: string, label: string, media?: AnkiCardMedia }) {
  const source = useMemo(() => renderAnkiCardDocument(card, html, media), [card, html, media])
  const observerRef = useRef<ResizeObserver | null>(null)
  const resize = useCallback((frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document)
      return
    frame.style.height = `${Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 120)}px`
  }, [])
  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget
    const document = frame.contentDocument
    if (!document)
      return
    observerRef.current?.disconnect()
    resize(frame)
    const observer = new ResizeObserver(() => resize(frame))
    observer.observe(document.documentElement)
    observerRef.current = observer
  }, [resize])
  useEffect(() => () => observerRef.current?.disconnect(), [])
  return (
    <iframe
      {...stylex.props(styles.frame)}
      aria-label={label}
      sandbox="allow-same-origin"
      srcDoc={source}
      title={label}
      onLoad={handleLoad}
    />
  )
}

export function AnkiNoteRenderer({ card, media, side = 'question' }: { card: AnkiRenderableCard, media?: AnkiCardMedia, side?: 'answer' | 'question' }) {
  const html = side === 'answer' ? card.answer : card.question
  return <NoteFrame card={card} html={html} label={side === 'answer' ? 'Anki answer' : 'Anki question'} media={media} />
}

export function AnkiCardPreview({ card, media }: { card: AnkiRenderableCard, media?: AnkiCardMedia }) {
  return (
    <div {...stylex.props(styles.surface)}>
      <div {...stylex.props(styles.side)}><AnkiNoteRenderer card={card} media={media} /></div>
      <div {...stylex.props(styles.side)}><AnkiNoteRenderer card={card} media={media} side="answer" /></div>
    </div>
  )
}
