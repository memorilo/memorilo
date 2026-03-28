import type { Editor } from '@tiptap/core'
import type { TableDeleteRequestDetail } from './table-delete'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@memorilo/components/ui/alert-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteTableAtPos,
  TABLE_DELETE_REQUEST_EVENT,
} from './table-delete'

interface PendingDeleteTable {
  editor: Editor
  tablePos: number
}

interface TableDeleteAlertHostProps {
  editor: Editor | null
}

export function TableDeleteAlertHost({ editor }: TableDeleteAlertHostProps) {
  const { t } = useTranslation('app')
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTable | null>(null)
  const closePendingDelete = () => setPendingDelete(null)

  useEffect(() => {
    if (!editor) {
      return
    }

    const handleDeleteRequest = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<TableDeleteRequestDetail>
      if (event.detail.editor !== editor) {
        return
      }

      event.preventDefault()
      setPendingDelete({
        editor: event.detail.editor,
        tablePos: event.detail.tablePos,
      })
    }

    window.addEventListener(TABLE_DELETE_REQUEST_EVENT, handleDeleteRequest)
    return () => window.removeEventListener(TABLE_DELETE_REQUEST_EVENT, handleDeleteRequest)
  }, [editor])

  const open = editor !== null && pendingDelete?.editor === editor

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !nextOpen && closePendingDelete()}>
      <AlertDialogContent data-testid="table-delete-alert">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.table.delete_confirm_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('editor.table.delete_confirm_description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="table-delete-alert-cancel"
            onClick={closePendingDelete}
          >
            {t('editor.table.delete_confirm_cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="table-delete-alert-confirm"
            onClick={() => {
              if (!pendingDelete) {
                return
              }

              deleteTableAtPos(pendingDelete.editor, pendingDelete.tablePos)
              closePendingDelete()
            }}
          >
            {t('editor.table.delete_confirm_action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
