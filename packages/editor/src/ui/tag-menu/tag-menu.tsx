'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Union } from 'prosekit/core'
import type { TagExtension } from '../../extension/tag-extension'
import type { TagRuntime } from '../../tag/tag-runtime'
import * as stylex from '@stylexjs/stylex'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor } from 'prosekit/react'
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from 'prosekit/react/autocomplete'
import { useEffect, useMemo, useState } from 'react'

import { getTagLabelError, isSameTagLabel, normalizeTagLabel } from '../../tag/tag-label'
import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'

const regex = new RegExp(
  (canUseRegexLookbehind() ? String.raw`(?<!\S)` : '')
  + String.raw`#[\p{L}\p{N}_-]*$`,
  'u',
)

function readMatchedLabel(editorElement: HTMLElement) {
  const match = editorElement.querySelector<HTMLElement>('.prosekit-autocomplete-match')
  const text = match?.dataset.autocompleteMatchText
  return text ? normalizeTagLabel(text) : ''
}

export default function TagMenu(props: { runtime: TagRuntime }) {
  const editor = useEditor<Union<[TagExtension, BasicExtension]>>()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [typedLabel, setTypedLabel] = useState('')
  const [tags, setTags] = useState<Awaited<ReturnType<TagRuntime['search']>>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open)
      return

    let active = true
    void props.runtime.search(query).then(
      (results) => {
        if (!active)
          return
        setTags(results)
        setLoading(false)
      },
      (searchError) => {
        if (!active)
          return
        setTags([])
        setError(searchError instanceof Error ? searchError.message : String(searchError))
        setLoading(false)
      },
    )

    return () => {
      active = false
    }
  }, [open, props.runtime, query])

  const normalizedTypedLabel = normalizeTagLabel(typedLabel)
  const exactTag = tags.find(tag => isSameTagLabel(tag.label, normalizedTypedLabel))
  const sortedTags = useMemo(() => exactTag
    ? [exactTag, ...tags.filter(tag => tag.id !== exactTag.id)]
    : tags, [exactTag, tags])
  const labelError = normalizedTypedLabel ? getTagLabelError(normalizedTypedLabel) : null
  const canCreate = Boolean(!loading && !error && normalizedTypedLabel && !exactTag && !labelError)

  const handleTagInsert = (id: string, label: string) => {
    editor.commands.insertTag({ id, label })
    editor.commands.insertText({ text: ' ' })
  }

  const handleTagCreate = () => {
    const tag = props.runtime.resolveOrCreate(normalizedTypedLabel)
    handleTagInsert(tag.id, tag.label)
  }

  return (
    <AutocompleteRoot
      regex={regex}
      onOpenChange={(event) => {
        setOpen(event.detail)
        if (event.detail) {
          setLoading(true)
          setTags([])
          setError(null)
          setTypedLabel(readMatchedLabel(editor.view.dom))
        }
      }}
      onQueryChange={(event) => {
        setLoading(true)
        setTags([])
        setError(null)
        setQuery(event.detail)
        const matchedLabel = readMatchedLabel(editor.view.dom)
        setTypedLabel(matchedLabel || event.detail)
      }}
    >
      <AutocompletePositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
        <AutocompletePopup
          {...stylex.props(
            floatingSurfaceStyles.motion,
            floatingSurfaceStyles.surface,
            autocompleteMenuStyles.popup,
          )}
        >
          <div {...stylex.props(autocompleteMenuStyles.content)}>
            <AutocompleteEmpty {...stylex.props(autocompleteMenuStyles.item)}>
              {loading ? 'Loading...' : error ?? labelError ?? 'No results'}
            </AutocompleteEmpty>

            {sortedTags.map(tag => (
              <AutocompleteItem
                key={tag.id}
                value={tag.label}
                {...stylex.props(autocompleteMenuStyles.item)}
                onSelect={() => handleTagInsert(tag.id, tag.label)}
              >
                #
                {tag.label}
              </AutocompleteItem>
            ))}

            {canCreate
              ? (
                  <AutocompleteItem
                    value={normalizedTypedLabel}
                    {...stylex.props(autocompleteMenuStyles.item)}
                    onSelect={handleTagCreate}
                  >
                    <span>
                      Create #
                      {normalizedTypedLabel}
                    </span>
                    <span {...stylex.props(autocompleteMenuStyles.keyboard)}>Enter</span>
                  </AutocompleteItem>
                )
              : null}
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
