import type { ReactNodeViewProps } from '@tiptap/react'
import { cn } from '@memorilo/utils'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { getCodeBlockResolvedLanguage, getCodeBlockSelectedLanguage } from '../libs/resolved-language'
import { LanguageSelect } from './language-select'

export function CodeBlockNodeView(props: ReactNodeViewProps) {
  const selectedLanguage = getCodeBlockSelectedLanguage(props.node.attrs)
  const language = getCodeBlockResolvedLanguage(
    props.node.attrs,
    props.extension.options.defaultLanguage as string | null | undefined,
  ) ?? 'text'

  return (
    <NodeViewWrapper>
      <pre
        className={cn(`language-${language} relative`)}
        data-user-select-lang={selectedLanguage}
        data-guess-lang={props.node.attrs.guess}
      >
        <LanguageSelect
          value={selectedLanguage}
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
