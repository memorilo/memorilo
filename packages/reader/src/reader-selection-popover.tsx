import type { CSSProperties } from 'react'
import type { ReaderAdapterSelection } from './internal/reader-adapter'
import type { ReaderAnnotationColor } from './types'
import * as stylex from '@stylexjs/stylex'
import { Copy, Highlighter, StickyNote, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { readerSelectionPopoverStyles as readerStyles } from './reader-selection-popover.stylex'
import { readerSharedStyles } from './reader-theme.stylex'

const annotationColors: readonly ReaderAnnotationColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

function colorStyle(color: ReaderAnnotationColor) {
  if (color === 'green')
    return readerSharedStyles.colorGreen
  if (color === 'blue')
    return readerSharedStyles.colorBlue
  if (color === 'pink')
    return readerSharedStyles.colorPink
  if (color === 'purple')
    return readerSharedStyles.colorPurple
  return readerSharedStyles.colorYellow
}

function paletteColorPosition(color: ReaderAnnotationColor) {
  if (color === 'green')
    return readerStyles.paletteColorGreen
  if (color === 'blue')
    return readerStyles.paletteColorBlue
  if (color === 'pink')
    return readerStyles.paletteColorPink
  if (color === 'purple')
    return readerStyles.paletteColorPurple
  return readerStyles.paletteColorYellow
}

function popoverLayout(
  selection: ReaderAdapterSelection,
  composerOpen: boolean,
  colorPaletteOpen: boolean,
): { placement: 'above' | 'below', style: CSSProperties } {
  const center = selection.clientRect.left + selection.clientRect.width / 2
  const compactRegionToolbar = selection.selection.type === 'region' && !colorPaletteOpen
  const estimatedWidth = composerOpen ? 320 : compactRegionToolbar ? 220 : 270
  const estimatedHeight = composerOpen ? 270 : 52
  const edgeInset = 12
  const halfWidth = Math.min(estimatedWidth / 2, (window.innerWidth - edgeInset * 2) / 2)
  const left = Math.min(window.innerWidth - edgeInset - halfWidth, Math.max(edgeInset + halfWidth, center))
  const placement = selection.clientRect.top >= estimatedHeight + 20 ? 'above' : 'below'
  return {
    placement,
    style: {
      left,
      top: placement === 'above'
        ? selection.clientRect.top - 10
        : selection.clientRect.top + selection.clientRect.height + 10,
    },
  }
}

interface ReaderSelectionPopoverProps {
  annotationEditingEnabled: boolean
  colorPaletteOpen: boolean
  noteComposerOpen: boolean
  noteDraft: string
  selectedColor: ReaderAnnotationColor
  selection: ReaderAdapterSelection
  onColorPaletteOpenChange: (open: boolean) => void
  onCopy: () => void
  onCreateHighlight: () => void
  onCreateNote: () => void
  onDismiss: () => void
  onNoteComposerOpenChange: (open: boolean) => void
  onNoteDraftChange: (draft: string) => void
  onSelectedColorChange: (color: ReaderAnnotationColor) => void
}

export function ReaderSelectionPopover({
  annotationEditingEnabled,
  colorPaletteOpen,
  noteComposerOpen,
  noteDraft,
  selectedColor,
  selection,
  onColorPaletteOpenChange,
  onCopy,
  onCreateHighlight,
  onCreateNote,
  onDismiss,
  onNoteComposerOpenChange,
  onNoteDraftChange,
  onSelectedColorChange,
}: ReaderSelectionPopoverProps) {
  const { t } = useTranslation('common')
  const layout = popoverLayout(selection, noteComposerOpen, colorPaletteOpen)
  const popoverBelow = layout.placement === 'below'
  const compactRegionToolbar = selection.selection.type === 'region' && !colorPaletteOpen

  if (annotationEditingEnabled && noteComposerOpen) {
    return (
      <div
        {...stylex.props(
          readerStyles.glassPopover,
          readerStyles.noteComposer,
          popoverBelow ? readerStyles.popoverBelow : readerStyles.popoverAbove,
        )}
        aria-label={t('reader.addAnnotation')}
        role="dialog"
        style={layout.style}
      >
        <div {...stylex.props(readerStyles.composerHeader)}>
          <span {...stylex.props(readerStyles.composerTitle)}>
            {selection.selection.type === 'text' ? t('reader.annotateSelection') : t('reader.annotateArea')}
          </span>
          <button
            {...stylex.props(readerStyles.selectionClose)}
            aria-label={t('reader.cancelAnnotation')}
            type="button"
            onClick={() => onNoteComposerOpenChange(false)}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        {selection.selection.type === 'text'
          ? <div {...stylex.props(readerStyles.composerQuote)}>{selection.selection.text}</div>
          : null}
        <textarea
          autoFocus
          {...stylex.props(readerStyles.composerTextarea)}
          aria-label={t('reader.annotationText')}
          placeholder={t('reader.writeNote')}
          rows={4}
          value={noteDraft}
          onChange={event => onNoteDraftChange(event.target.value)}
        />
        <div {...stylex.props(readerStyles.composerFooter)}>
          <div {...stylex.props(readerStyles.colorGroup)} aria-label={t('reader.annotationColor')} role="group">
            {annotationColors.map(color => (
              <button
                key={color}
                {...stylex.props(
                  readerStyles.colorButton,
                  colorStyle(color),
                  selectedColor === color && readerStyles.colorButtonSelected,
                )}
                aria-label={t('reader.colorAnnotation', { color: t(`reader.colors.${color}`) })}
                aria-pressed={selectedColor === color}
                type="button"
                onClick={() => onSelectedColorChange(color)}
              />
            ))}
          </div>
          <button
            {...stylex.props(readerSharedStyles.primaryTextButton)}
            disabled={!noteDraft.trim()}
            type="button"
            onClick={onCreateNote}
          >
            {t('reader.addAnnotation')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      {...stylex.props(
        readerStyles.glassPopover,
        readerStyles.selectionToolbar,
        !annotationEditingEnabled && readerStyles.selectionToolbarCopyOnly,
        compactRegionToolbar && readerStyles.selectionToolbarRegion,
        popoverBelow ? readerStyles.popoverBelow : readerStyles.popoverAbove,
      )}
      aria-label={t('reader.selectionActions')}
      role="toolbar"
      style={layout.style}
    >
      {annotationEditingEnabled && colorPaletteOpen
        ? annotationColors.map(color => (
            <button
              key={color}
              {...stylex.props(
                readerStyles.paletteSwatch,
                paletteColorPosition(color),
                colorStyle(color),
                selectedColor === color && readerStyles.colorButtonSelected,
              )}
              aria-label={t('reader.colorAnnotation', { color: t(`reader.colors.${color}`) })}
              aria-pressed={selectedColor === color}
              title={t('reader.useColor', { color: t(`reader.colors.${color}`) })}
              type="button"
              onClick={() => {
                onSelectedColorChange(color)
                onColorPaletteOpenChange(false)
              }}
            />
          ))
        : (
            <>
              {selection.selection.type === 'text'
                ? (
                    <button
                      {...stylex.props(readerStyles.paletteTool, readerStyles.paletteCopy)}
                      aria-label={t('reader.copySelection')}
                      title={t('copy')}
                      type="button"
                      onClick={onCopy}
                    >
                      <Copy aria-hidden="true" size={18} strokeWidth={1.85} />
                    </button>
                  )
                : null}
              {annotationEditingEnabled
                ? (
                    <>
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteColorTool,
                          readerStyles.paletteColor,
                          selection.selection.type === 'region' && readerStyles.paletteColorRegion,
                        )}
                        aria-label={t('reader.chooseAnnotationColor')}
                        aria-expanded={colorPaletteOpen}
                        title={t('reader.color')}
                        type="button"
                        onClick={() => onColorPaletteOpenChange(true)}
                      >
                        <span {...stylex.props(readerStyles.paletteCurrentColor, colorStyle(selectedColor))} />
                      </button>
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteHighlight,
                          selection.selection.type === 'region' && readerStyles.paletteHighlightRegion,
                        )}
                        aria-label={selection.selection.type === 'text'
                          ? t('reader.highlightSelection')
                          : t('reader.highlightArea')}
                        title={t('reader.highlight')}
                        type="button"
                        onClick={onCreateHighlight}
                      >
                        <Highlighter aria-hidden="true" size={19} strokeWidth={1.85} />
                      </button>
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteAnnotate,
                          selection.selection.type === 'region' && readerStyles.paletteAnnotateRegion,
                        )}
                        aria-label={selection.selection.type === 'text'
                          ? t('reader.annotateSelection')
                          : t('reader.annotateArea')}
                        title={t('reader.annotate')}
                        type="button"
                        onClick={() => {
                          onColorPaletteOpenChange(false)
                          onNoteComposerOpenChange(true)
                        }}
                      >
                        <StickyNote aria-hidden="true" size={19} strokeWidth={1.85} />
                      </button>
                    </>
                  )
                : null}
            </>
          )}
      <button
        {...stylex.props(readerStyles.paletteTool, readerStyles.paletteClose)}
        aria-label={t('reader.dismissSelectionActions')}
        title={t('reader.close')}
        type="button"
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={18} strokeWidth={1.85} />
      </button>
    </div>
  )
}
