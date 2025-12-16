import type { RenderElementProps } from 'slate-react'
import { Array, Match, pipe } from 'effect'

import { createContext, use, useEffect, useMemo, useState } from 'react'
import { Editor, Transforms } from 'slate'
import { ReactEditor, useSlate } from 'slate-react'
import { UtilButton } from './util-button'

interface ElementWrapperUtilButtonEnableContextValue {
  enable: boolean
  setEnable: (enable: boolean) => void
}

/**
 * Context to control the visibility of the utility buttons on the parent element.
 * When a child element is rendered, it disables the parent's utility buttons to prevent overlap or clutter.
 */
const ElementWrapperUtilButtonEnableContext = createContext<ElementWrapperUtilButtonEnableContextValue | undefined>(undefined)

export function ElementWrapper({ children, element }: RenderElementProps) {
  const editor = useSlate()
  const [enable, setEnable] = useState(true)

  const { setEnable: setParentElementWrapperEnable } = use(ElementWrapperUtilButtonEnableContext) ?? {
    // No parent context, provide no-op functions
    setEnable: () => { },
  }

  const contextValue = useMemo(() => (
    { enable, setEnable }
  ), [enable, setEnable])

  useEffect(() => {
    setParentElementWrapperEnable(false)
    return () => {
      setParentElementWrapperEnable(true)
    }
  }, [setParentElementWrapperEnable])

  const toolbar = enable
    ? (
        <div className="absolute -left-6 -top-1 inline scale-75 select-none! opacity-0 transition group-hover:opacity-100 group-focus:opacity-100 group-active:opacity-100">
          <UtilButton
            contentEditable={false}
            title="Click to add element below"
            onClick={() => {
              const path = Match.value(ReactEditor.findPath(editor, element)).pipe(
                Match.when(
                  p => p.length > 1,
                  p => pipe(
                    Array.initNonEmpty(p as Array.NonEmptyArray<number>),
                    Array.append(Array.lastNonEmpty(p as Array.NonEmptyArray<number>) + 1),
                  ),
                ),
                Match.orElse(p => [Array.headNonEmpty(p as Array.NonEmptyArray<number>) + 1]),
              )
              Transforms.insertNodes(editor, { type: 'plain', children: [{ text: '' }] }, { at: path })
              ReactEditor.focus(editor)
              Transforms.select(editor, { path, offset: 0 })
            }}
            tabIndex={-1}
          >
            <p className="before:content-[attr(data-content)]" data-content="+"></p>
          </UtilButton>
          <UtilButton
            contentEditable={false}
            title="Click to add element below"
            disabled={Editor.isVoid(editor, element)}
            onClick={() => {
              const path = [...ReactEditor.findPath(editor, element)]
              Transforms.select(editor, {
                anchor: Editor.start(editor, path),
                focus: Editor.end(editor, path),
              })
              ReactEditor.focus(editor)
            }}
            tabIndex={-1}
          >
            <p className="before:content-[attr(data-content)]" data-content="···"></p>
          </UtilButton>
        </div>
      )
    : null

  return (
    <div className="group relative pl-12" data-toolbar={enable}>
      <ElementWrapperUtilButtonEnableContext value={contextValue}>
        {children}
      </ElementWrapperUtilButtonEnableContext>
      {
        toolbar
      }
    </div>
  )
}
