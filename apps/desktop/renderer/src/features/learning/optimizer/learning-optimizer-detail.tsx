import type {
  LearningOptimizerWorkflow,
  OptimizerDraft,
} from './learning-optimizer-workflow'
import { Button, Dialog, Switch } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { useLatestOperations } from '../../../shared/lifecycle/owned-resource'
import { usePageTitlebar } from '../../../shared/page-titlebar'
import { learningQueryKeys } from '../query-keys'
import { learningOptimizerDetailStyles as styles } from './learning-optimizer-detail.stylex'
import { OptimizerEditor } from './learning-optimizer-editor'
import {
  optimizerErrorMessage,
  useLearningOptimizerWorkflow,
} from './learning-optimizer-lifecycle'
import { learningOptimizerSharedStyles as sharedStyles } from './learning-optimizer-shared.stylex'

type DialogKind = 'delete' | 'optimize' | 'reset' | null
type OperationKind = Exclude<DialogKind, null> | 'save'

export function LearningOptimizerDetail({
  onDeleted,
  optimizerId,
}: {
  onDeleted: () => Promise<void> | void
  optimizerId: string
}) {
  const workflow = useLearningOptimizerWorkflow()
  if (!workflow)
    return null
  return (
    <LearningOptimizerDetailSession
      key={optimizerId}
      optimizerId={optimizerId}
      onDeleted={onDeleted}
      workflow={workflow}
    />
  )
}

function LearningOptimizerDetailSession({
  optimizerId,
  onDeleted,
  workflow,
}: {
  optimizerId: string
  onDeleted: () => Promise<void> | void
  workflow: LearningOptimizerWorkflow
}) {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const query = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('learning.list-optimizers', workflow.load),
    queryKey: learningQueryKeys.optimizers,
  }))
  const [drafts, setDrafts] = useState<Record<string, OptimizerDraft>>({})
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [operation, setOperation] = useState<OperationKind | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success', message: string } | null>(null)
  const [rescheduleNow, setRescheduleNow] = useState(false)
  const [editorResetRevision, setEditorResetRevision] = useState(0)
  const operationActive = useRef(false)
  const completion = useLatestOperations<'completion'>('Learning optimizer operation completion', {
    concurrency: 'parallel',
  })
  const busy = operation !== null

  const selectedRecord = query.data?.find(record => record.optimizer.id === optimizerId)
  const selectedOptimizer = selectedRecord?.optimizer
  const titlebar = useMemo(() => ({
    title: selectedOptimizer
      ? selectedOptimizer.isGlobal ? t('globalOptimizer') : selectedOptimizer.name
      : t('optimizerTab'),
  }), [selectedOptimizer, t])
  usePageTitlebar(titlebar)
  const selectedDraft = selectedOptimizer
    ? drafts[selectedOptimizer.id] ?? {
      ...workflow.draft(selectedOptimizer),
    }
    : undefined
  const closeDialog = () => {
    if (busy)
      return
    setDialog(null)
    setRescheduleNow(false)
  }
  const clearDraft = (optimizerId: string) => {
    setDrafts((current) => {
      const next = { ...current }
      delete next[optimizerId]
      return next
    })
  }
  const refresh = async () => queryClient.invalidateQueries({ queryKey: learningQueryKeys.optimizers })
  const runOperation = (
    kind: OperationKind,
    operationLabel: string,
    work: () => Promise<{ status: 'busy' } | { message: string, status: 'accepted' }>,
  ) => {
    if (operationActive.current)
      return
    operationActive.current = true
    setOperation(kind)
    setFeedback(null)
    void completion.run(
      'completion',
      () => work(),
    ).then(
      (result) => {
        if (result.status === 'superseded')
          return
        if (result.value.status === 'accepted') {
          setFeedback({ kind: 'success', message: result.value.message })
          setDialog(null)
          setRescheduleNow(false)
        }
        operationActive.current = false
        setOperation(null)
      },
      (error) => {
        const message = t('operationFailed', { message: optimizerErrorMessage(error), operation: operationLabel })
        setDialog(null)
        setFeedback({ kind: 'error', message })
        operationActive.current = false
        setOperation(null)
      },
    )
  }

  if (query.isPending) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(sharedStyles.status)} role="status">
          <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={16} />
          <span>{t('loadingOptimizers')}</span>
        </div>
      </main>
    )
  }

  if (query.isError) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(sharedStyles.status)} role="alert">
          <span>{t('loadOptimizersFailed')}</span>
          <Button variant="plain" xstyle={sharedStyles.actionButton} onClick={() => void query.refetch()}>{t('retry')}</Button>
        </div>
      </main>
    )
  }

  if (!selectedRecord || !selectedOptimizer || !selectedDraft) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(sharedStyles.status)} role="alert">
          <span>{t('optimizerNotFound')}</span>
          <Button asChild variant="plain" xstyle={sharedStyles.actionButton}>
            <Link search={{ view: 'optimizer' }} to="/learning">{t('backToOptimizers')}</Link>
          </Button>
        </div>
      </main>
    )
  }

  const updateDraft = (draft: OptimizerDraft) => {
    setDrafts(current => ({ ...current, [selectedOptimizer.id]: draft }))
  }
  const save = (immediate: boolean) => {
    void runOperation('save', t('saveChanges'), async () => {
      const result = await workflow.save(selectedOptimizer, selectedDraft, immediate)
      if (result.status === 'busy')
        return result
      clearDraft(selectedOptimizer.id)
      await refresh()
      return { message: t('saved'), status: 'accepted' }
    })
  }
  return (
    <main {...stylex.props(styles.detailPage)} aria-label={titlebar.title}>
      <div {...stylex.props(styles.workspace)}>
        <OptimizerEditor
          key={`${selectedOptimizer.id}:${selectedOptimizer.revisionId}:${editorResetRevision}`}
          draft={selectedDraft}
          feedback={feedback}
          noteCount={selectedRecord.noteCount}
          operation={operation}
          optimizer={selectedOptimizer}
          workflow={workflow}
          onChange={updateDraft}
          onDelete={() => {
            setFeedback(null)
            setDialog('delete')
          }}
          onDiscard={() => {
            clearDraft(selectedOptimizer.id)
            setEditorResetRevision(revision => revision + 1)
            setFeedback(null)
          }}
          onOptimize={() => {
            setFeedback(null)
            setRescheduleNow(false)
            setDialog('optimize')
          }}
          onReset={() => {
            setFeedback(null)
            setRescheduleNow(false)
            setDialog('reset')
          }}
          onSave={save}
        />

        {dialog === 'optimize'
          ? (
              <Dialog.Root
                open
                onOpenChange={(open) => {
                  if (!open)
                    closeDialog()
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content aria-label={t('optimizeTitle', { name: selectedOptimizer.name })}>
                    <Dialog.Header>
                      <Dialog.Title>{t('optimizeTitle', { name: selectedOptimizer.isGlobal ? t('globalOptimizer') : selectedOptimizer.name })}</Dialog.Title>
                      <Dialog.Close asChild>
                        <Button aria-label={t('close')} disabled={busy} variant="toolbar"><X aria-hidden="true" size={15} /></Button>
                      </Dialog.Close>
                    </Dialog.Header>
                    <Dialog.Body>
                      <p {...stylex.props(styles.dialogDescription)}>{t('optimizeDescription')}</p>
                      <p {...stylex.props(styles.dialogNote)}>{selectedRecord.noteCount === 0 ? t('optimizeNoNotes') : t('optimizeHistory', { count: selectedRecord.noteCount })}</p>
                      <label {...stylex.props(styles.dialogSwitchRow)}>
                        <span>
                          <strong>{t('rescheduleNow')}</strong>
                          <small>{t('rescheduleLaterDescription')}</small>
                        </span>
                        <Switch aria-label={t('rescheduleNow')} checked={rescheduleNow} disabled={busy} variant="compact" onCheckedChange={setRescheduleNow} />
                      </label>
                    </Dialog.Body>
                    <Dialog.Footer>
                      <Button disabled={busy} variant="plain" xstyle={sharedStyles.actionButton} onClick={closeDialog}>{t('cancel')}</Button>
                      <Button
                        disabled={busy}
                        variant="plain"
                        xstyle={[sharedStyles.actionButton, sharedStyles.actionButtonStrong]}
                        onClick={() => void runOperation('optimize', t('optimize'), async () => {
                          const result = await workflow.optimize(selectedOptimizer.id, rescheduleNow)
                          if (result.status === 'busy')
                            return result
                          clearDraft(selectedOptimizer.id)
                          await refresh()
                          return { message: t('optimized'), status: 'accepted' }
                        })}
                      >
                        {busy ? <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={14} /> : <Sparkles aria-hidden="true" size={14} />}
                        <span>{busy ? t('optimizing') : t('optimize')}</span>
                      </Button>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            )
          : null}

        {dialog === 'reset'
          ? (
              <Dialog.Root
                open
                onOpenChange={(open) => {
                  if (!open)
                    closeDialog()
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content aria-label={t('restoreTitle')}>
                    <Dialog.Header><Dialog.Title>{t('restoreTitle')}</Dialog.Title></Dialog.Header>
                    <Dialog.Body>
                      <p {...stylex.props(styles.dialogDescription)}>{t('restoreDescription')}</p>
                      <label {...stylex.props(styles.dialogSwitchRow)}>
                        <span>
                          <strong>{t('rescheduleNow')}</strong>
                          <small>{t('rescheduleLaterDescription')}</small>
                        </span>
                        <Switch aria-label={t('rescheduleNow')} checked={rescheduleNow} disabled={busy} variant="compact" onCheckedChange={setRescheduleNow} />
                      </label>
                    </Dialog.Body>
                    <Dialog.Footer>
                      <Button disabled={busy} variant="plain" xstyle={sharedStyles.actionButton} onClick={closeDialog}>{t('cancel')}</Button>
                      <Button
                        disabled={busy}
                        variant="plain"
                        xstyle={[sharedStyles.actionButton, sharedStyles.actionButtonStrong]}
                        onClick={() => void runOperation('reset', t('restoreDefaults'), async () => {
                          const result = await workflow.reset(selectedOptimizer.id, rescheduleNow)
                          if (result.status === 'busy')
                            return result
                          clearDraft(selectedOptimizer.id)
                          await refresh()
                          return { message: t('restored'), status: 'accepted' }
                        })}
                      >
                        {t('confirm')}
                      </Button>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            )
          : null}

        {dialog === 'delete'
          ? (
              <Dialog.Root
                open
                onOpenChange={(open) => {
                  if (!open)
                    closeDialog()
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay />
                  <Dialog.Content aria-label={t('deleteTitle', { name: selectedOptimizer.name })}>
                    <Dialog.Header><Dialog.Title>{t('deleteTitle', { name: selectedOptimizer.name })}</Dialog.Title></Dialog.Header>
                    <Dialog.Body><p {...stylex.props(styles.dialogDescription)}>{t('deleteDescription', { count: selectedRecord.noteCount })}</p></Dialog.Body>
                    <Dialog.Footer>
                      <Button disabled={busy} variant="plain" xstyle={sharedStyles.actionButton} onClick={closeDialog}>{t('cancel')}</Button>
                      <Button
                        disabled={busy}
                        variant="plain"
                        xstyle={[sharedStyles.actionButton, sharedStyles.actionButtonDanger]}
                        onClick={() => void runOperation('delete', t('deleteOptimizer'), async () => {
                          const result = await workflow.archive(selectedOptimizer.id)
                          if (result.status === 'busy')
                            return result
                          clearDraft(selectedOptimizer.id)
                          await refresh()
                          await onDeleted()
                          return { message: t('deleted'), status: 'accepted' }
                        })}
                      >
                        {t('deleteOptimizer')}
                      </Button>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            )
          : null}
      </div>
    </main>
  )
}
