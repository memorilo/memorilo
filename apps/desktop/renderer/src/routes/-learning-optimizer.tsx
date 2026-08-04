import type { DesktopLearningApi } from '@memorilo/desktop-preload'
import type { FormEvent, ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronRight,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../components/page-titlebar'
import { router } from '../router'
import { learningOptimizerStyles as styles } from './-learning-optimizer.stylex'

type FsrsOptimizer = Awaited<ReturnType<DesktopLearningApi['getOptimizer']>>
type OptimizerConfiguration = FsrsOptimizer['configuration']
type ConfigurationSource = 'factory' | 'global'
type DialogKind = 'delete' | 'optimize' | 'reset' | null
type OperationKind = Exclude<DialogKind, null> | 'save'

interface OptimizerRecord {
  noteCount: number
  optimizer: FsrsOptimizer
}

interface OptimizerDraft {
  configuration: OptimizerConfiguration
  name: string
}

const optimizerQueryKey = ['learning', 'optimizers'] as const
const stepPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?[mhd]$/u

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseSteps(value: string): readonly string[] {
  const steps = value.split(',').map(step => step.trim()).filter(step => step.length > 0)
  if (steps.some(step => !stepPattern.test(step)))
    throw new TypeError('Invalid learning steps')
  return steps
}

function parseConfigurationSource(value: string): ConfigurationSource {
  if (value === 'factory' || value === 'global')
    return value
  throw new TypeError(`Unknown optimizer configuration source: ${value}`)
}

function sameConfiguration(left: OptimizerConfiguration, right: OptimizerConfiguration): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function loadOptimizers(): Promise<readonly OptimizerRecord[]> {
  const optimizers = (await window.desktop.learning.listOptimizers())
    .filter(optimizer => optimizer.status === 'active')
  return Promise.all(optimizers.map(async optimizer => ({
    noteCount: await window.desktop.learning.getOptimizerNoteCount(optimizer.id),
    optimizer,
  })))
}

function Modal({
  children,
  label,
  onClose,
}: {
  children: ReactNode
  label: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog)
      throw new Error('Optimizer dialog is not mounted')
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      {...stylex.props(styles.dialog)}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <motion.div
        {...stylex.props(styles.dialogSurface)}
        animate={{ filter: 'brightness(1) saturate(1)', opacity: 1, scale: 1, y: 0 }}
        initial={{ filter: shouldReduceMotion ? 'none' : 'brightness(1.08) saturate(1.22)', opacity: shouldReduceMotion ? 1 : 0.72, scale: shouldReduceMotion ? 1 : 0.982, y: shouldReduceMotion ? 0 : 5 }}
        transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, type: 'spring', visualDuration: 0.24 }}
      >
        {children}
      </motion.div>
    </dialog>
  )
}

function Switch({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      {...stylex.props(styles.switch, checked && styles.switchOn)}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span {...stylex.props(styles.switchThumb, checked && styles.switchThumbOn)} />
    </button>
  )
}

function SettingRow({
  children,
  description,
  label,
}: {
  children: ReactNode
  description?: string
  label: string
}) {
  return (
    <div {...stylex.props(styles.settingRow)}>
      <div {...stylex.props(styles.settingCopy)}>
        <span {...stylex.props(styles.settingLabel)}>{label}</span>
        {description ? <span {...stylex.props(styles.settingDescription)}>{description}</span> : null}
      </div>
      <div {...stylex.props(styles.controlSlot)}>{children}</div>
    </div>
  )
}

function FormSection({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section {...stylex.props(styles.formSection)}>
      <header {...stylex.props(styles.sectionHeader)}>
        <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
        <p {...stylex.props(styles.sectionDescription)}>{description}</p>
      </header>
      <div {...stylex.props(styles.settingList)}>{children}</div>
    </section>
  )
}

function OptimizerEditor({
  draft,
  feedback,
  noteCount,
  onChange,
  onDelete,
  onDiscard,
  onReset,
  onSave,
  operation,
  optimizer,
}: {
  draft: OptimizerDraft
  feedback: { kind: 'error' | 'success', message: string } | null
  noteCount: number
  onChange: (draft: OptimizerDraft) => void
  onDelete: () => void
  onDiscard: () => void
  onReset: () => void
  onSave: (rescheduleNow: boolean) => void
  operation: OperationKind | null
  optimizer: FsrsOptimizer
}) {
  const { i18n, t } = useTranslation('learning')
  const [learningSteps, setLearningSteps] = useState(draft.configuration.learningSteps.join(', '))
  const [relearningSteps, setRelearningSteps] = useState(draft.configuration.relearningSteps.join(', '))
  const [stepError, setStepError] = useState<string | null>(null)
  const [rescheduleNow, setRescheduleNow] = useState(false)
  const busy = operation !== null
  const saving = operation === 'save'
  const configurationChanged = !sameConfiguration(draft.configuration, optimizer.configuration)
  const nameChanged = draft.name.trim() !== optimizer.name
  const dirty = configurationChanged || nameChanged
  const disabled = busy
  const updatedDate = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(optimizer.updatedAt), [i18n.language, optimizer.updatedAt])
  const displayName = optimizer.isGlobal ? t('globalOptimizer') : optimizer.name

  const updateConfiguration = (next: Partial<OptimizerConfiguration>) => {
    onChange({ ...draft, configuration: { ...draft.configuration, ...next } })
  }
  const updateQueuePolicy = (next: Partial<OptimizerConfiguration['queuePolicy']>) => {
    updateConfiguration({ queuePolicy: { ...draft.configuration.queuePolicy, ...next } })
  }
  const commitSteps = (kind: 'learningSteps' | 'relearningSteps', value: string) => {
    try {
      const steps = parseSteps(value)
      setStepError(null)
      updateConfiguration({ [kind]: steps })
    }
    catch {
      setStepError(t('invalidSteps'))
    }
  }

  return (
    <div {...stylex.props(styles.detail)}>
      <div {...stylex.props(styles.detailScroll)}>
        <div {...stylex.props(styles.detailContent)}>
          <header {...stylex.props(styles.detailHeader)}>
            <div {...stylex.props(styles.headingCopy)}>
              <div {...stylex.props(styles.titleLine)}>
                {optimizer.isGlobal
                  ? <Globe2 aria-hidden="true" size={18} strokeWidth={1.8} />
                  : null}
                {optimizer.isGlobal
                  ? <h2 {...stylex.props(styles.detailTitle)}>{displayName}</h2>
                  : (
                      <input
                        {...stylex.props(styles.nameInput)}
                        aria-label={t('optimizerName')}
                        disabled={disabled}
                        value={draft.name}
                        onChange={event => onChange({ ...draft, name: event.target.value })}
                      />
                    )}
                {optimizer.isGlobal
                  ? <LockKeyhole aria-label={t('globalLocked')} size={14} strokeWidth={1.8} />
                  : null}
              </div>
              <p {...stylex.props(styles.detailDescription)}>
                {optimizer.isGlobal ? t('globalDescription') : t('renameDescription')}
              </p>
              <div {...stylex.props(styles.metadata)}>
                <span>{t('notesCount', { count: noteCount })}</span>
                <span aria-hidden="true">·</span>
                <span>{t('updatedAt', { date: updatedDate })}</span>
              </div>
            </div>
          </header>

          {feedback
            ? (
                <div {...stylex.props(styles.feedback, feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess)} role={feedback.kind === 'error' ? 'alert' : 'status'}>
                  {feedback.kind === 'success' ? <Check aria-hidden="true" size={14} /> : null}
                  <span>{feedback.message}</span>
                </div>
              )
            : null}

          <form
            {...stylex.props(styles.form)}
            onSubmit={(event) => {
              event.preventDefault()
              onSave(rescheduleNow)
            }}
          >
            <FormSection description={t('memoryDescription')} title={t('memory')}>
              <SettingRow label={t('desiredRetention')}>
                <div {...stylex.props(styles.rangeControl)}>
                  <input
                    {...stylex.props(styles.range)}
                    aria-label={t('desiredRetention')}
                    disabled={disabled}
                    max={99}
                    min={70}
                    step={1}
                    type="range"
                    value={Math.round(draft.configuration.desiredRetention * 100)}
                    onChange={event => updateConfiguration({ desiredRetention: Number(event.target.value) / 100 })}
                  />
                  <span {...stylex.props(styles.valueLabel)}>
                    {Math.round(draft.configuration.desiredRetention * 100)}
                    %
                  </span>
                </div>
              </SettingRow>
              <SettingRow label={t('maximumInterval')}>
                <div {...stylex.props(styles.numberControl)}>
                  <input
                    {...stylex.props(styles.input, styles.numberInput)}
                    aria-label={t('maximumInterval')}
                    disabled={disabled}
                    max={36500}
                    min={1}
                    type="number"
                    value={draft.configuration.maximumIntervalDays}
                    onChange={event => updateConfiguration({ maximumIntervalDays: Number(event.target.value) })}
                  />
                  <span {...stylex.props(styles.unit)}>{t('days')}</span>
                </div>
              </SettingRow>
              <SettingRow description={t('enableFuzzDescription')} label={t('enableFuzz')}>
                <Switch
                  checked={draft.configuration.enableFuzz}
                  disabled={disabled}
                  label={t('enableFuzz')}
                  onChange={enableFuzz => updateConfiguration({ enableFuzz })}
                />
              </SettingRow>
            </FormSection>

            <FormSection description={t('stepsDescription')} title={t('steps')}>
              <SettingRow label={t('learningSteps')}>
                <input
                  {...stylex.props(styles.input)}
                  aria-invalid={stepError !== null}
                  aria-label={t('learningSteps')}
                  disabled={disabled}
                  placeholder={t('stepsPlaceholder')}
                  value={learningSteps}
                  onBlur={() => commitSteps('learningSteps', learningSteps)}
                  onChange={event => setLearningSteps(event.target.value)}
                />
              </SettingRow>
              <SettingRow label={t('relearningSteps')}>
                <input
                  {...stylex.props(styles.input)}
                  aria-invalid={stepError !== null}
                  aria-label={t('relearningSteps')}
                  disabled={disabled}
                  placeholder={t('stepsPlaceholder')}
                  value={relearningSteps}
                  onBlur={() => commitSteps('relearningSteps', relearningSteps)}
                  onChange={event => setRelearningSteps(event.target.value)}
                />
              </SettingRow>
              {stepError ? <p {...stylex.props(styles.inlineError)} role="alert">{stepError}</p> : null}
            </FormSection>

            <FormSection description={t('queueDescription')} title={t('queue')}>
              <SettingRow label={t('newGatherOrder')}>
                <select
                  {...stylex.props(styles.input)}
                  aria-label={t('newGatherOrder')}
                  disabled={disabled}
                  value={draft.configuration.queuePolicy.newGatherOrder}
                  onChange={event => updateQueuePolicy({ newGatherOrder: event.target.value as 'random' | 'source' })}
                >
                  <option value="source">{t('sourceOrder')}</option>
                  <option value="random">{t('randomOrder')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('newReviewOrder')}>
                <select
                  {...stylex.props(styles.input)}
                  aria-label={t('newReviewOrder')}
                  disabled={disabled}
                  value={draft.configuration.queuePolicy.newReviewOrder}
                  onChange={event => updateQueuePolicy({ newReviewOrder: event.target.value as 'after-reviews' | 'before-reviews' | 'mixed' })}
                >
                  <option value="mixed">{t('mixed')}</option>
                  <option value="before-reviews">{t('beforeReviews')}</option>
                  <option value="after-reviews">{t('afterReviews')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('interdayOrder')}>
                <select
                  {...stylex.props(styles.input)}
                  aria-label={t('interdayOrder')}
                  disabled={disabled}
                  value={draft.configuration.queuePolicy.interdayOrder}
                  onChange={event => updateQueuePolicy({ interdayOrder: event.target.value as 'after-reviews' | 'before-reviews' | 'mixed' })}
                >
                  <option value="before-reviews">{t('beforeReviews')}</option>
                  <option value="after-reviews">{t('afterReviews')}</option>
                  <option value="mixed">{t('mixed')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('reviewOrder')}>
                <select
                  {...stylex.props(styles.input)}
                  aria-label={t('reviewOrder')}
                  disabled={disabled}
                  value={draft.configuration.queuePolicy.reviewOrder}
                  onChange={event => updateQueuePolicy({ reviewOrder: event.target.value as 'due-random' | 'retrievability' })}
                >
                  <option value="due-random">{t('dueRandom')}</option>
                  <option value="retrievability">{t('retrievability')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('learnAhead')}>
                <div {...stylex.props(styles.numberControl)}>
                  <input
                    {...stylex.props(styles.input, styles.numberInput)}
                    aria-label={t('learnAhead')}
                    disabled={disabled}
                    min={0}
                    type="number"
                    value={draft.configuration.queuePolicy.learnAheadMinutes}
                    onChange={event => updateQueuePolicy({ learnAheadMinutes: Number(event.target.value) })}
                  />
                  <span {...stylex.props(styles.unit)}>{t('minutes')}</span>
                </div>
              </SettingRow>
              <SettingRow label={t('studyDayStarts')}>
                <select
                  {...stylex.props(styles.input, styles.shortSelect)}
                  aria-label={t('studyDayStarts')}
                  disabled={disabled}
                  value={draft.configuration.queuePolicy.studyDayStartsAtHour}
                  onChange={event => updateQueuePolicy({ studyDayStartsAtHour: Number(event.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>{t('hourValue', { hour: String(hour).padStart(2, '0') })}</option>
                  ))}
                </select>
              </SettingRow>
            </FormSection>

            <FormSection description={t('siblingsDescription')} title={t('siblings')}>
              <SettingRow label={t('buryNewSiblings')}>
                <Switch checked={draft.configuration.queuePolicy.buryNewSiblings} disabled={disabled} label={t('buryNewSiblings')} onChange={buryNewSiblings => updateQueuePolicy({ buryNewSiblings })} />
              </SettingRow>
              <SettingRow label={t('buryReviewSiblings')}>
                <Switch checked={draft.configuration.queuePolicy.buryReviewSiblings} disabled={disabled} label={t('buryReviewSiblings')} onChange={buryReviewSiblings => updateQueuePolicy({ buryReviewSiblings })} />
              </SettingRow>
              <SettingRow label={t('buryInterdaySiblings')}>
                <Switch checked={draft.configuration.queuePolicy.buryInterdayLearningSiblings} disabled={disabled} label={t('buryInterdaySiblings')} onChange={buryInterdayLearningSiblings => updateQueuePolicy({ buryInterdayLearningSiblings })} />
              </SettingRow>
            </FormSection>

            <FormSection description={t('advancedDescription')} title={t('advanced')}>
              <SettingRow label={t('parameterCount', { count: draft.configuration.fsrsParameters.length })}>
                <code {...stylex.props(styles.parameters)}>{draft.configuration.fsrsParameters.map(value => Number(value.toFixed(4))).join(', ')}</code>
              </SettingRow>
            </FormSection>

            <div {...stylex.props(styles.formActions)}>
              <div {...stylex.props(styles.secondaryActions)}>
                <button {...stylex.props(styles.textButton)} disabled={disabled} type="button" onClick={onReset}>
                  <RotateCcw aria-hidden="true" size={14} />
                  <span>{t('restoreDefaults')}</span>
                </button>
                {optimizer.isGlobal
                  ? null
                  : (
                      <button {...stylex.props(styles.textButton, styles.dangerButton)} disabled={disabled} type="button" onClick={onDelete}>
                        <Trash2 aria-hidden="true" size={14} />
                        <span>{t('deleteOptimizer')}</span>
                      </button>
                    )}
              </div>
              <div {...stylex.props(styles.saveCluster)}>
                {dirty
                  ? <button {...stylex.props(styles.textButton)} disabled={disabled} type="button" onClick={onDiscard}>{t('discardDraft')}</button>
                  : null}
                <label {...stylex.props(styles.rescheduleControl)}>
                  <Switch checked={rescheduleNow} disabled={disabled || !configurationChanged} label={t('rescheduleNow')} onChange={setRescheduleNow} />
                  <span>{t('rescheduleNow')}</span>
                </label>
                <button {...stylex.props(styles.actionButton, styles.actionButtonStrong)} disabled={disabled || !dirty || stepError !== null || draft.name.trim().length === 0} type="submit">
                  {saving ? <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={14} /> : null}
                  <span>{saving ? t('saving') : t('saveChanges')}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

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
}: {
  globalOptimizer: FsrsOptimizer
  onClose: () => void
  onCreated: (optimizerId: string) => Promise<void>
}) {
  const { t } = useTranslation('learning')
  const [createName, setCreateName] = useState('')
  const [createSource, setCreateSource] = useState<ConfigurationSource>('global')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (!creating)
      onClose()
  }
  const create = (event: FormEvent) => {
    event.preventDefault()
    const name = createName.trim()
    if (name.length === 0) {
      setError(t('optimizerNameRequired'))
      return
    }

    setCreating(true)
    setError(null)
    void window.desktop.learning.createOptimizer({
      ...(createSource === 'global'
        ? { configuration: structuredClone(globalOptimizer.configuration) }
        : {}),
      name,
    }).then(async (created) => {
      await onCreated(created.id)
    }).catch((creationError: unknown) => {
      setError(t('operationFailed', {
        message: errorMessage(creationError),
        operation: t('create'),
      }))
    }).finally(() => setCreating(false))
  }

  return (
    <Modal label={t('newOptimizerTitle')} onClose={close}>
      <form onSubmit={create}>
        <header {...stylex.props(styles.dialogHeader)}>
          <h2 {...stylex.props(styles.dialogTitle)}>{t('newOptimizerTitle')}</h2>
          <button {...stylex.props(styles.dialogClose)} aria-label={t('close')} disabled={creating} type="button" onClick={onClose}>
            <X aria-hidden="true" size={15} />
          </button>
        </header>
        <div {...stylex.props(styles.dialogBody)}>
          <label {...stylex.props(styles.dialogField)}>
            <span>{t('optimizerName')}</span>
            <input autoFocus {...stylex.props(styles.input)} disabled={creating} value={createName} onChange={event => setCreateName(event.target.value)} />
          </label>
          {error
            ? <div {...stylex.props(styles.feedback, styles.feedbackError)} role="alert">{error}</div>
            : null}
          <label {...stylex.props(styles.dialogField)}>
            <span>{t('configurationSource')}</span>
            <select {...stylex.props(styles.input)} disabled={creating} value={createSource} onChange={event => setCreateSource(parseConfigurationSource(event.target.value))}>
              <option value="global">{t('currentGlobal')}</option>
              <option value="factory">{t('factoryDefaults')}</option>
            </select>
          </label>
        </div>
        <footer {...stylex.props(styles.dialogActions)}>
          <button {...stylex.props(styles.actionButton)} disabled={creating} type="button" onClick={onClose}>{t('cancel')}</button>
          <button {...stylex.props(styles.actionButton, styles.actionButtonStrong)} disabled={creating || createName.trim().length === 0} type="submit">
            {creating ? <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={14} /> : null}
            <span>{creating ? t('creating') : t('create')}</span>
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function LearningOptimizerPanel() {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const query = useQuery({ queryFn: loadOptimizers, queryKey: optimizerQueryKey })
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  if (query.isPending) {
    return (
      <div {...stylex.props(styles.status)} role="status">
        <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={16} />
        <span>{t('loadingOptimizers')}</span>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div {...stylex.props(styles.status)} role="alert">
        <span>{t('loadOptimizersFailed')}</span>
        <button {...stylex.props(styles.actionButton)} type="button" onClick={() => void query.refetch()}>{t('retry')}</button>
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
            <button
              {...stylex.props(styles.liquidPrimaryButton)}
              type="button"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus aria-hidden="true" size={15} strokeWidth={2} />
              <span>{t('newOptimizer')}</span>
            </button>
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
              onClose={() => setCreateDialogOpen(false)}
              onCreated={async (optimizerId) => {
                await queryClient.invalidateQueries({ queryKey: optimizerQueryKey })
                await router.navigate({
                  params: { optimizerId },
                  to: '/learning/optimizer/$optimizerId',
                })
              }}
            />
          )
        : null}
    </div>
  )
}

export function LearningOptimizerDetail({ optimizerId }: { optimizerId: string }) {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const query = useQuery({ queryFn: loadOptimizers, queryKey: optimizerQueryKey })
  const [drafts, setDrafts] = useState<Record<string, OptimizerDraft>>({})
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [operation, setOperation] = useState<OperationKind | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success', message: string } | null>(null)
  const [rescheduleNow, setRescheduleNow] = useState(false)
  const [editorResetRevision, setEditorResetRevision] = useState(0)
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
      configuration: selectedOptimizer.configuration,
      name: selectedOptimizer.name,
    }
    : undefined
  const selectedDirty = selectedOptimizer && selectedDraft
    ? selectedDraft.name.trim() !== selectedOptimizer.name
    || !sameConfiguration(selectedDraft.configuration, selectedOptimizer.configuration)
    : false

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
  const refresh = async () => queryClient.invalidateQueries({ queryKey: optimizerQueryKey })
  const runOperation = async (kind: OperationKind, operationLabel: string, work: () => Promise<string>) => {
    setOperation(kind)
    setFeedback(null)
    try {
      const message = await work()
      setFeedback({ kind: 'success', message })
      setDialog(null)
      setRescheduleNow(false)
    }
    catch (error) {
      const message = t('operationFailed', { message: errorMessage(error), operation: operationLabel })
      setDialog(null)
      setFeedback({ kind: 'error', message })
    }
    finally {
      setOperation(null)
    }
  }

  if (query.isPending) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(styles.status)} role="status">
          <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={16} />
          <span>{t('loadingOptimizers')}</span>
        </div>
      </main>
    )
  }

  if (query.isError) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(styles.status)} role="alert">
          <span>{t('loadOptimizersFailed')}</span>
          <button {...stylex.props(styles.actionButton)} type="button" onClick={() => void query.refetch()}>{t('retry')}</button>
        </div>
      </main>
    )
  }

  if (!selectedRecord || !selectedOptimizer || !selectedDraft) {
    return (
      <main {...stylex.props(styles.detailPage)}>
        <div {...stylex.props(styles.status)} role="alert">
          <span>{t('optimizerNotFound')}</span>
          <Link {...stylex.props(styles.actionButton)} search={{ view: 'optimizer' }} to="/learning">{t('backToOptimizers')}</Link>
        </div>
      </main>
    )
  }

  const updateDraft = (draft: OptimizerDraft) => {
    setDrafts(current => ({ ...current, [selectedOptimizer.id]: draft }))
  }
  const save = (immediate: boolean) => {
    void runOperation('save', t('saveChanges'), async () => {
      const normalizedName = selectedDraft.name.trim()
      if (!selectedOptimizer.isGlobal && normalizedName !== selectedOptimizer.name) {
        await window.desktop.learning.renameOptimizer({
          name: normalizedName,
          optimizerId: selectedOptimizer.id,
        })
      }
      if (!sameConfiguration(selectedDraft.configuration, selectedOptimizer.configuration)) {
        await window.desktop.learning.updateOptimizer({
          configuration: selectedDraft.configuration,
          optimizerId: selectedOptimizer.id,
          rescheduleNow: immediate,
        })
      }
      clearDraft(selectedOptimizer.id)
      await refresh()
      return t('saved')
    })
  }
  const records = query.data

  return (
    <main {...stylex.props(styles.detailPage)} aria-label={titlebar.title}>
      <div {...stylex.props(styles.workspace)}>
        <div {...stylex.props(styles.toolbarRegion)}>
          <div
            {...stylex.props(styles.toolbarCluster)}
            aria-label={t('optimizers')}
            role="toolbar"
          >
            <div {...stylex.props(styles.liquidToolbar)}>
              <span {...stylex.props(styles.toolbarIcon)}>
                {selectedOptimizer.isGlobal
                  ? <Globe2 aria-hidden="true" size={14} strokeWidth={1.8} />
                  : <SlidersHorizontal aria-hidden="true" size={14} strokeWidth={1.8} />}
              </span>
              <select
                {...stylex.props(styles.optimizerSelector)}
                aria-label={t('optimizers')}
                disabled={busy}
                value={selectedOptimizer.id}
                onChange={(event) => {
                  setFeedback(null)
                  void router.navigate({
                    params: { optimizerId: event.target.value },
                    to: '/learning/optimizer/$optimizerId',
                  })
                }}
              >
                {records.map(record => (
                  <option key={record.optimizer.id} value={record.optimizer.id}>
                    {record.optimizer.isGlobal ? t('globalOptimizer') : record.optimizer.name}
                  </option>
                ))}
              </select>
              {selectedDirty ? <span {...stylex.props(styles.dirtyDot)} aria-label={t('unsaved')} /> : null}
            </div>
            <div {...stylex.props(styles.liquidToolbar)}>
              <button
                {...stylex.props(styles.toolbarAction)}
                disabled={busy || selectedDirty}
                title={selectedDirty ? t('unsaved') : t('optimize')}
                type="button"
                onClick={() => {
                  setFeedback(null)
                  setRescheduleNow(false)
                  setDialog('optimize')
                }}
              >
                {operation === 'optimize'
                  ? <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={14} />
                  : <Sparkles aria-hidden="true" size={14} />}
                <span>{operation === 'optimize' ? t('optimizing') : t('optimize')}</span>
              </button>
            </div>
          </div>
        </div>

        <OptimizerEditor
          key={`${selectedOptimizer.id}:${selectedOptimizer.revisionId}:${editorResetRevision}`}
          draft={selectedDraft}
          feedback={feedback}
          noteCount={selectedRecord.noteCount}
          operation={operation}
          optimizer={selectedOptimizer}
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
          onReset={() => {
            setFeedback(null)
            setRescheduleNow(false)
            setDialog('reset')
          }}
          onSave={save}
        />

        {dialog === 'optimize'
          ? (
              <Modal label={t('optimizeTitle', { name: selectedOptimizer.name })} onClose={closeDialog}>
                <header {...stylex.props(styles.dialogHeader)}>
                  <h2 {...stylex.props(styles.dialogTitle)}>{t('optimizeTitle', { name: selectedOptimizer.isGlobal ? t('globalOptimizer') : selectedOptimizer.name })}</h2>
                  <button {...stylex.props(styles.dialogClose)} aria-label={t('close')} disabled={busy} type="button" onClick={closeDialog}><X aria-hidden="true" size={15} /></button>
                </header>
                <div {...stylex.props(styles.dialogBody)}>
                  <p {...stylex.props(styles.dialogDescription)}>{t('optimizeDescription')}</p>
                  <p {...stylex.props(styles.dialogNote)}>{selectedRecord.noteCount === 0 ? t('optimizeNoNotes') : t('optimizeHistory', { count: selectedRecord.noteCount })}</p>
                  <label {...stylex.props(styles.dialogSwitchRow)}>
                    <span>
                      <strong>{t('rescheduleNow')}</strong>
                      <small>{t('rescheduleLaterDescription')}</small>
                    </span>
                    <Switch checked={rescheduleNow} disabled={busy} label={t('rescheduleNow')} onChange={setRescheduleNow} />
                  </label>
                </div>
                <footer {...stylex.props(styles.dialogActions)}>
                  <button {...stylex.props(styles.actionButton)} disabled={busy} type="button" onClick={closeDialog}>{t('cancel')}</button>
                  <button
                    {...stylex.props(styles.actionButton, styles.actionButtonStrong)}
                    disabled={busy}
                    type="button"
                    onClick={() => void runOperation('optimize', t('optimize'), async () => {
                      await window.desktop.learning.optimizeOptimizer({ optimizerId: selectedOptimizer.id, rescheduleNow })
                      clearDraft(selectedOptimizer.id)
                      await refresh()
                      return t('optimized')
                    })}
                  >
                    {busy ? <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={14} /> : <Sparkles aria-hidden="true" size={14} />}
                    <span>{busy ? t('optimizing') : t('optimize')}</span>
                  </button>
                </footer>
              </Modal>
            )
          : null}

        {dialog === 'reset'
          ? (
              <Modal label={t('restoreTitle')} onClose={closeDialog}>
                <header {...stylex.props(styles.dialogHeader)}><h2 {...stylex.props(styles.dialogTitle)}>{t('restoreTitle')}</h2></header>
                <div {...stylex.props(styles.dialogBody)}>
                  <p {...stylex.props(styles.dialogDescription)}>{t('restoreDescription')}</p>
                  <label {...stylex.props(styles.dialogSwitchRow)}>
                    <span>
                      <strong>{t('rescheduleNow')}</strong>
                      <small>{t('rescheduleLaterDescription')}</small>
                    </span>
                    <Switch checked={rescheduleNow} disabled={busy} label={t('rescheduleNow')} onChange={setRescheduleNow} />
                  </label>
                </div>
                <footer {...stylex.props(styles.dialogActions)}>
                  <button {...stylex.props(styles.actionButton)} disabled={busy} type="button" onClick={closeDialog}>{t('cancel')}</button>
                  <button
                    {...stylex.props(styles.actionButton, styles.actionButtonStrong)}
                    disabled={busy}
                    type="button"
                    onClick={() => void runOperation('reset', t('restoreDefaults'), async () => {
                      await window.desktop.learning.resetOptimizerDefaults(selectedOptimizer.id, rescheduleNow)
                      clearDraft(selectedOptimizer.id)
                      await refresh()
                      return t('restored')
                    })}
                  >
                    {t('confirm')}
                  </button>
                </footer>
              </Modal>
            )
          : null}

        {dialog === 'delete'
          ? (
              <Modal label={t('deleteTitle', { name: selectedOptimizer.name })} onClose={closeDialog}>
                <header {...stylex.props(styles.dialogHeader)}><h2 {...stylex.props(styles.dialogTitle)}>{t('deleteTitle', { name: selectedOptimizer.name })}</h2></header>
                <div {...stylex.props(styles.dialogBody)}><p {...stylex.props(styles.dialogDescription)}>{t('deleteDescription', { count: selectedRecord.noteCount })}</p></div>
                <footer {...stylex.props(styles.dialogActions)}>
                  <button {...stylex.props(styles.actionButton)} disabled={busy} type="button" onClick={closeDialog}>{t('cancel')}</button>
                  <button
                    {...stylex.props(styles.actionButton, styles.actionButtonDanger)}
                    disabled={busy}
                    type="button"
                    onClick={() => void runOperation('delete', t('deleteOptimizer'), async () => {
                      await window.desktop.learning.archiveOptimizer(selectedOptimizer.id)
                      clearDraft(selectedOptimizer.id)
                      await refresh()
                      await router.navigate({ search: { view: 'optimizer' }, to: '/learning' })
                      return t('deleted')
                    })}
                  >
                    {t('deleteOptimizer')}
                  </button>
                </footer>
              </Modal>
            )
          : null}
      </div>
    </main>
  )
}
