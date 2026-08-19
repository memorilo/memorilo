import type { EditorModeValue } from '../../common/editor-mode'
import type { EditorTopicDocument } from '../../note/editor-note'
import * as stylex from '@stylexjs/stylex'
import { AlignLeft, ListTree } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorMode } from '../../common/editor-mode'
import { useEditorTopicMode } from '../../note/use-editor-topic-mode'
import { editorModeControlStyles as styles } from './editor-mode-control.stylex'

interface EditorModeOption {
  icon: typeof AlignLeft
  labelKey: 'ui.documentMode' | 'ui.outlineMode'
  mode: EditorModeValue
}

const options: readonly EditorModeOption[] = [
  { icon: AlignLeft, labelKey: 'ui.documentMode', mode: EditorMode.Document },
  { icon: ListTree, labelKey: 'ui.outlineMode', mode: EditorMode.Outline },
]

export interface EditorModeControlProps {
  topic: EditorTopicDocument
}

export function EditorModeControl({ topic }: EditorModeControlProps) {
  const mode = useEditorTopicMode(topic)
  const { t } = useTranslation('editor')

  return (
    <div {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.control)} aria-label={t('ui.editorMode')} role="group">
        {options.map((option) => {
          const Icon = option.icon
          const selected = mode === option.mode
          const label = t(option.labelKey)
          return (
            <button
              key={option.mode}
              {...stylex.props(styles.option, selected && styles.optionSelected)}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              type="button"
              onClick={() => topic.setMode(option.mode)}
            >
              <Icon aria-hidden="true" size={15} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
