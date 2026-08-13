import type { ReactNode } from 'react'
import type {
  FsrsOptimizer,
  LearningOptimizerWorkflow,
  OptimizerConfiguration,
  OptimizerDraft,
} from './learning-optimizer-workflow'
import * as stylex from '@stylexjs/stylex'
import {
  Check,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { learningOptimizerEditorStyles as styles } from './learning-optimizer-editor.stylex'
import { learningOptimizerSharedStyles as sharedStyles } from './learning-optimizer-shared.stylex'

export function Switch({
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

export function OptimizerEditor({
  draft,
  feedback,
  noteCount,
  onChange,
  onDelete,
  onDiscard,
  onOptimize,
  onReset,
  onSave,
  operation,
  optimizer,
  workflow,
}: {
  draft: OptimizerDraft
  feedback: { kind: 'error' | 'success', message: string } | null
  noteCount: number
  onChange: (draft: OptimizerDraft) => void
  onDelete: () => void
  onDiscard: () => void
  onOptimize: () => void
  onReset: () => void
  onSave: (rescheduleNow: boolean) => void
  operation: 'delete' | 'optimize' | 'reset' | 'save' | null
  optimizer: FsrsOptimizer
  workflow: Pick<LearningOptimizerWorkflow, 'configurationChanged' | 'parseSteps'>
}) {
  const { i18n, t } = useTranslation('learning')
  const [learningSteps, setLearningSteps] = useState(draft.configuration.learningSteps.join(', '))
  const [relearningSteps, setRelearningSteps] = useState(draft.configuration.relearningSteps.join(', '))
  const [stepError, setStepError] = useState<string | null>(null)
  const [rescheduleNow, setRescheduleNow] = useState(false)
  const busy = operation !== null
  const optimizing = operation === 'optimize'
  const saving = operation === 'save'
  const configurationChanged = workflow.configurationChanged(draft, optimizer)
  const nameChanged = draft.name.trim() !== optimizer.name
  const dirty = configurationChanged || nameChanged
  const updatedDate = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(optimizer.updatedAt), [i18n.language, optimizer.updatedAt])
  const displayName = optimizer.isGlobal ? t('globalOptimizer') : optimizer.name

  const updateConfiguration = (next: Partial<OptimizerConfiguration>) => {
    onChange({ ...draft, configuration: { ...draft.configuration, ...next } })
  }
  const commitSteps = (kind: 'learningSteps' | 'relearningSteps', value: string) => {
    try {
      const steps = workflow.parseSteps(value)
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
                {optimizer.isGlobal ? <Globe2 aria-hidden="true" size={18} strokeWidth={1.8} /> : null}
                {optimizer.isGlobal
                  ? <h2 {...stylex.props(styles.detailTitle)}>{displayName}</h2>
                  : (
                      <input
                        {...stylex.props(styles.nameInput)}
                        aria-label={t('optimizerName')}
                        disabled={busy}
                        value={draft.name}
                        onChange={event => onChange({ ...draft, name: event.target.value })}
                      />
                    )}
                {optimizer.isGlobal ? <LockKeyhole aria-label={t('globalLocked')} size={14} strokeWidth={1.8} /> : null}
              </div>
              <p {...stylex.props(styles.detailDescription)}>
                {optimizer.isGlobal ? t('globalDescription') : t('renameDescription')}
              </p>
              <div {...stylex.props(styles.metadata)}>
                <span>{t('notesCount', { count: noteCount })}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{t('updatedAt', { date: updatedDate })}</span>
              </div>
            </div>
          </header>

          {feedback
            ? (
                <div {...stylex.props(sharedStyles.feedback, feedback.kind === 'error' ? sharedStyles.feedbackError : sharedStyles.feedbackSuccess)} role={feedback.kind === 'error' ? 'alert' : 'status'}>
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
                    disabled={busy}
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
                    {...stylex.props(sharedStyles.input, styles.numberInput)}
                    aria-label={t('maximumInterval')}
                    disabled={busy}
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
                <Switch checked={draft.configuration.enableFuzz} disabled={busy} label={t('enableFuzz')} onChange={enableFuzz => updateConfiguration({ enableFuzz })} />
              </SettingRow>
            </FormSection>

            <FormSection description={t('stepsDescription')} title={t('steps')}>
              <SettingRow label={t('learningSteps')}>
                <input
                  {...stylex.props(sharedStyles.input)}
                  aria-invalid={stepError !== null}
                  aria-label={t('learningSteps')}
                  disabled={busy}
                  placeholder={t('stepsPlaceholder')}
                  value={learningSteps}
                  onBlur={() => commitSteps('learningSteps', learningSteps)}
                  onChange={event => setLearningSteps(event.target.value)}
                />
              </SettingRow>
              <SettingRow label={t('relearningSteps')}>
                <input
                  {...stylex.props(sharedStyles.input)}
                  aria-invalid={stepError !== null}
                  aria-label={t('relearningSteps')}
                  disabled={busy}
                  placeholder={t('stepsPlaceholder')}
                  value={relearningSteps}
                  onBlur={() => commitSteps('relearningSteps', relearningSteps)}
                  onChange={event => setRelearningSteps(event.target.value)}
                />
              </SettingRow>
              {stepError ? <p {...stylex.props(styles.inlineError)} role="alert">{stepError}</p> : null}
            </FormSection>

            <FormSection description={t('advancedDescription')} title={t('advanced')}>
              <SettingRow label={t('parameterCount', { count: draft.configuration.fsrsParameters.length })}>
                <div {...stylex.props(styles.parametersControl)}>
                  <code {...stylex.props(styles.parameters)}>{draft.configuration.fsrsParameters.map(value => Number(value.toFixed(4))).join(', ')}</code>
                  <div {...stylex.props(styles.parameterActions)}>
                    <button {...stylex.props(sharedStyles.actionButton)} disabled={busy || dirty} title={dirty ? t('unsaved') : t('optimize')} type="button" onClick={onOptimize}>
                      {optimizing ? <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={14} /> : <Sparkles aria-hidden="true" size={14} />}
                      <span>{optimizing ? t('optimizing') : t('optimize')}</span>
                    </button>
                  </div>
                </div>
              </SettingRow>
            </FormSection>

            <div {...stylex.props(styles.formActions)}>
              <div {...stylex.props(styles.secondaryActions)}>
                <button {...stylex.props(styles.textButton)} disabled={busy} type="button" onClick={onReset}>
                  <RotateCcw aria-hidden="true" size={14} />
                  <span>{t('restoreDefaults')}</span>
                </button>
                {optimizer.isGlobal
                  ? null
                  : (
                      <button {...stylex.props(styles.textButton, styles.dangerButton)} disabled={busy} type="button" onClick={onDelete}>
                        <Trash2 aria-hidden="true" size={14} />
                        <span>{t('deleteOptimizer')}</span>
                      </button>
                    )}
              </div>
              <div {...stylex.props(styles.saveCluster)}>
                {dirty ? <button {...stylex.props(styles.textButton)} disabled={busy} type="button" onClick={onDiscard}>{t('discardDraft')}</button> : null}
                <label {...stylex.props(styles.rescheduleControl)}>
                  <Switch checked={rescheduleNow} disabled={busy || !configurationChanged} label={t('rescheduleNow')} onChange={setRescheduleNow} />
                  <span>{t('rescheduleNow')}</span>
                </label>
                <button {...stylex.props(sharedStyles.actionButton, sharedStyles.actionButtonStrong)} disabled={busy || !dirty || stepError !== null || draft.name.trim().length === 0} type="submit">
                  {saving ? <LoaderCircle {...stylex.props(sharedStyles.spinner)} aria-hidden="true" size={14} /> : null}
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
