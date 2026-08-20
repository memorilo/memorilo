import type { FormEvent } from 'react'
import type {
  ConfigurationSource,
  FsrsOptimizer,
  LearningOptimizerWorkflow,
  OptimizerRecord,
} from './learning-optimizer-workflow'
import { Button, Dialog } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronRight,
  Globe2,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { useLatestOperations } from '../../../shared/lifecycle/owned-resource'
import { learningQueryKeys } from '../query-keys'
import {
  optimizerErrorMessage,
  useLearningOptimizerWorkflow,
} from './learning-optimizer-lifecycle'
import { learningOptimizerPanelStyles as styles } from './learning-optimizer-panel.stylex'
import { learningOptimizerSharedStyles as sharedStyles } from './learning-optimizer-shared.stylex'

function OptimizerListRow({
  index,
  record,
}: {
  index: number
  record: OptimizerRecord
}) {
  const { i18n, t } = useTranslation('learning')
  const shouldReduceMotion = useReducedMotion()
  const { optimizer } = record
  const displayName = optimizer.isGlobal ? t('globalOptimizer') : optimizer.name
  const updatedDate = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  }).format(optimizer.updatedAt), [i18n.language, optimizer.updatedAt])
  const retention = Math.round(optimizer.configuration.desiredRetention * 100)

  return (
    <motion.div
      {...stylex.props(styles.optimizerListItem)}
      animate={{ opacity: 1, y: 0 }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      role="listitem"
      transition={shouldReduceMotion
        ? { duration: 0 }
        : { bounce: 0, delay: index * 0.035, type: 'spring', visualDuration: 0.24 }}
    >
      <Link
        {...stylex.props(styles.optimizerRow)}
        aria-label={t('openOptimizer', { name: displayName })}
        params={{ optimizerId: optimizer.id }}
        preload="intent"
        to="/learning/optimizer/$optimizerId"
      >
        <span {...stylex.props(styles.optimizerIcon, optimizer.isGlobal && styles.optimizerIconGlobal)}>
          {optimizer.isGlobal
            ? <Globe2 aria-hidden="true" size={17} strokeWidth={1.8} />
            : <SlidersHorizontal aria-hidden="true" size={17} strokeWidth={1.8} />}
        </span>
        <span {...stylex.props(styles.optimizerIdentity)}>
          <span {...stylex.props(styles.optimizerName)}>{displayName}</span>
          <span {...stylex.props(styles.optimizerKind)}>
            {optimizer.isGlobal ? t('globalType') : t('customType')}
          </span>
        </span>
        <span {...stylex.props(styles.optimizerMetrics)}>
          <span>{t('notesCount', { count: record.noteCount })}</span>
          <span>{t('retentionValue', { percent: retention })}</span>
          <span>{t('updatedAt', { date: updatedDate })}</span>
        </span>
        <ChevronRight {...stylex.props(styles.optimizerChevron)} aria-hidden="true" size={16} strokeWidth={1.8} />
      </Link>
    </motion.div>
  )
}

function CreateOptimizerDialog({
  globalOptimizer,
  onClose,
  onCreated,
  workflow,
}: {
  globalOptimizer: FsrsOptimizer
  onClose: () => void
  onCreated: (optimizerId: string) => Promise<void>
  workflow: LearningOptimizerWorkflow
}) {
  const { t } = useTranslation('learning')
  const [createName, setCreateName] = useState('')
  const [createSource, setCreateSource] = useState<ConfigurationSource>('global')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createActive = useRef(false)
  const completion = useLatestOperations<'completion'>('Learning optimizer creation completion', {
    concurrency: 'parallel',
  })

  const close = () => {
    if (!creating)
      onClose()
  }
  const create = (event: FormEvent) => {
    event.preventDefault()
    if (createActive.current)
      return
    const name = createName.trim()
    if (name.length === 0) {
      setError(t('optimizerNameRequired'))
      return
    }

    createActive.current = true
    setCreating(true)
    setError(null)
    void completion.run(
      'completion',
      async ({ isCurrent }) => {
        const result = await workflow.create(name, createSource, globalOptimizer.configuration)
        if (result.status === 'accepted' && isCurrent())
          await onCreated(result.value.id)
        return result
      },
    ).then(
      (result) => {
        if (result.status === 'superseded')
          return
        createActive.current = false
        setCreating(false)
      },
      (creationError) => {
        setError(t('operationFailed', {
          message: optimizerErrorMessage(creationError),
          operation: t('create'),
        }))
        createActive.current = false
        setCreating(false)
      },
    )
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open)
          close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-label={t('newOptimizerTitle')}>
          <form onSubmit={create}>
            <Dialog.Header>
              <Dialog.Title>{t('newOptimizerTitle')}</Dialog.Title>
              <Dialog.Close asChild>
                <Button aria-label={t('close')} disabled={creating} variant="toolbar"><X aria-hidden="true" size={15} /></Button>
              </Dialog.Close>
            </Dialog.Header>
            <Dialog.Body>
              <label {...stylex.props(styles.dialogField)}>
                <span>{t('optimizerName')}</span>
                <input autoFocus {...stylex.props(sharedStyles.input)} disabled={creating} value={createName} onChange={event => setCreateName(event.target.value)} />
              </label>
              {error
                ? <div {...stylex.props(sharedStyles.feedback, sharedStyles.feedbackError)} role="alert">{error}</div>
                : null}
              <label {...stylex.props(styles.dialogField)}>
                <span>{t('configurationSource')}</span>
                <select {...stylex.props(sharedStyles.input)} disabled={creating} value={createSource} onChange={event => setCreateSource(workflow.parseConfigurationSource(event.target.value))}>
                  <option value="global">{t('currentGlobal')}</option>
                  <option value="factory">{t('factoryDefaults')}</option>
                </select>
              </label>
            </Dialog.Body>
            <Dialog.Footer>
              <Button disabled={creating} variant="plain" xstyle={sharedStyles.actionButton} onClick={onClose}>{t('cancel')}</Button>
              <Button disabled={creating || createName.trim().length === 0} type="submit" variant="plain" xstyle={[sharedStyles.actionButton, sharedStyles.actionButtonStrong]}>
                {creating ? <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={14} /> : null}
                <span>{creating ? t('creating') : t('create')}</span>
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function LearningOptimizerPanel({
  onOpenOptimizer,
}: {
  onOpenOptimizer: (optimizerId: string) => Promise<void> | void
}) {
  const workflow = useLearningOptimizerWorkflow()
  if (!workflow)
    return null
  return <LearningOptimizerPanelSession workflow={workflow} onOpenOptimizer={onOpenOptimizer} />
}

function LearningOptimizerPanelSession({
  onOpenOptimizer,
  workflow,
}: {
  onOpenOptimizer: (optimizerId: string) => Promise<void> | void
  workflow: LearningOptimizerWorkflow
}) {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const query = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('learning.list-optimizers', workflow.load),
    queryKey: learningQueryKeys.optimizers,
  }))
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  if (query.isPending) {
    return (
      <div {...stylex.props(sharedStyles.status)} role="status">
        <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={16} />
        <span>{t('loadingOptimizers')}</span>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div {...stylex.props(sharedStyles.status)} role="alert">
        <span>{t('loadOptimizersFailed')}</span>
        <Button variant="plain" xstyle={sharedStyles.actionButton} onClick={() => void query.refetch()}>{t('retry')}</Button>
      </div>
    )
  }

  const records = query.data
  const globalRecord = records.find(record => record.optimizer.isGlobal)
  if (!globalRecord)
    throw new Error('Learning storage did not return an active Global Optimizer')

  return (
    <div {...stylex.props(styles.listWorkspace)}>
      <div {...stylex.props(styles.listScroll)}>
        <div {...stylex.props(styles.listContent)}>
          <header {...stylex.props(styles.listHeader)}>
            <div {...stylex.props(styles.listHeading)}>
              <h2 {...stylex.props(styles.listTitle)}>{t('optimizers')}</h2>
              <p {...stylex.props(styles.listSummary)}>{t('optimizerCount', { count: records.length })}</p>
            </div>
            <Button
              variant="plain"
              xstyle={styles.liquidPrimaryButton}
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus aria-hidden="true" size={15} strokeWidth={2} />
              <span>{t('newOptimizer')}</span>
            </Button>
          </header>
          <div {...stylex.props(styles.optimizerList)} role="list">
            {records.map((record, index) => (
              <OptimizerListRow key={record.optimizer.id} index={index} record={record} />
            ))}
          </div>
        </div>
      </div>

      {createDialogOpen
        ? (
            <CreateOptimizerDialog
              globalOptimizer={globalRecord.optimizer}
              workflow={workflow}
              onClose={() => setCreateDialogOpen(false)}
              onCreated={async (optimizerId) => {
                await queryClient.invalidateQueries({ queryKey: learningQueryKeys.optimizers })
                await onOpenOptimizer(optimizerId)
              }}
            />
          )
        : null}
    </div>
  )
}
