import type { ReactNodeViewProps } from '@tiptap/react'
import { cn } from '@memorilo/utils'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { LanguageSelect } from './language-select'

export function CodeBlockNodeView(props: ReactNodeViewProps) {
  const language = (typeof props.node.attrs.language === 'string' && props.node.attrs.language)
    || (typeof props.node.attrs.guess === 'string' && props.node.attrs.guess)
    || (props.extension.options.defaultLanguage as string)

  return (
    <NodeViewWrapper>
      <pre
        className={cn(`language-${language} relative`)}
        data-user-select-lang={props.node.attrs.language}
        data-guess-lang={props.node.attrs.guess}
      >
        <LanguageSelect
          value={language}
          onChange={nextLanguage => props.updateAttributes({
            language: nextLanguage,
          })}
        />
        <code className={cn(`language-${language}`)}>
          <NodeViewContent />
        </code>
      </pre>
    </NodeViewWrapper>
  )
}
