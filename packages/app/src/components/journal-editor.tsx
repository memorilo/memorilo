import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { DocTitleInput } from '~/components/doc-title-input'
import { Editor } from '~/components/editor'

interface JournalEditorProps {
  docId: string
}

export function JournalEditor({ docId }: JournalEditorProps) {
  const navigate = useNavigate()
  const focusNode = useCallback((nodeId: string) => {
    navigate({
      to: '/note/$docId/$nodeId',
      params: { docId, nodeId },
    })
  }, [navigate, docId])

  return (
    <div className="flex flex-col gap-2">
      <DocTitleInput
        docId={docId}
        size="compact"
        containerClassName="p-0"
      />
      <div className="[&_.ProseMirror]:min-h-40">
        <Editor
          docId={docId}
          onOutlineClick={focusNode}
          hideTitle
        />
      </div>
    </div>
  )
}
