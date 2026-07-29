import type { EditorMode, EditorProps } from '../../src/editor'
import { useState } from 'react'

import { Editor } from '../../src/editor'

export interface EditorModeHarnessProps extends Omit<EditorProps, 'mode'> {
  initialMode?: EditorMode
}

export function EditorModeHarness({ initialMode = 'document', ...editorProps }: EditorModeHarnessProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode)

  return (
    <>
      <div aria-label="Editor mode" role="group">
        <button aria-label="Document mode" aria-pressed={mode === 'document'} type="button" onClick={() => setMode('document')}>
          Document
        </button>
        <button aria-label="Outline mode" aria-pressed={mode === 'outline'} type="button" onClick={() => setMode('outline')}>
          Outline
        </button>
      </div>
      <Editor {...editorProps} mode={mode} />
    </>
  )
}
