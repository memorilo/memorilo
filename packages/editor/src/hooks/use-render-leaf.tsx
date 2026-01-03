import type { RenderLeafProps } from 'slate-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { DefaultLeaf, useSlateStatic } from 'slate-react'
import { isBlockActive } from '../lib/editorHelper'

export function useRenderLeaf() {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  return useCallback(
    (props: RenderLeafProps) => {
      if (props.leaf.placeholder && isBlockActive(editor, 'plain')) {
        return (
          <>
            <span className="pointer-events-none absolute top-0 bg-transparent opacity-30" contentEditable={false}>
              {t('editor.placeholder.slashCommand')}
            </span>
            <DefaultLeaf {...props} />
          </>
        )
      }
      const { text, ...rest } = props.leaf

      return (
        <span
          className={Object.entries(rest).filter(([, value]) => value).map(([name]) => name).join(' ')}
          {...props.attributes}
        >
          {props.children}
        </span>
      )
    },
    [editor, t],
  )
}
