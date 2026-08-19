import type {
  FsrsOptimizer,
  LearningActivitySummary,
  LearningDailyGoalMode,
  LearningMaintenanceEstimate,
  LearningPracticeConfiguration,
  LearningQueueItem,
  LearningQueueMode,
} from '@memorilo/editor-storage'
import type { MobileRuntime } from '@/application/mobile-runtime'
import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { ActionButton } from '@/ui/action-button'
import { GlassHeader } from '@/ui/glass-header'
import { IconButton } from '@/ui/icon-button'
import { SegmentedControl } from '@/ui/segmented-control'
import { TextField } from '@/ui/text-field'
import { colors } from '@/ui/theme'

interface LearningOverviewProps {
  mode: LearningQueueMode
  onModeChange: (mode: LearningQueueMode) => void
  onQueueChanged: () => void
  runtime: MobileRuntime
}

type SettingsView = 'maintenance' | 'optimizer' | 'practice' | 'reset' | 'root' | null

interface QueueSnapshot {
  mixed: number
  new: number
  review: number
  items: readonly LearningQueueItem[]
}

const modes: readonly { id: LearningQueueMode, label: string }[] = [
  { id: 'mixed', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'review', label: 'Review' },
]

const styles = StyleSheet.create({
  activity: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  activityBand: {
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 11,
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  modeControl: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  modalRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalScroll: {
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  modalSection: {
    gap: 10,
    paddingTop: 18,
  },
  modalSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSummary: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  practiceFieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  practiceField: {
    marginHorizontal: 0,
  },
  practiceSection: {
    gap: 8,
    paddingTop: 18,
  },
  practiceSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  practiceSwitchRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 2,
  },
  practiceSwitchText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  practiceActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 20,
  },
  actionFlex: {
    flex: 1,
  },
  optimizerEditor: {
    gap: 8,
    paddingTop: 12,
  },
  optimizerEditorActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },
  optimizerEditorField: {
    marginHorizontal: 0,
  },
  optimizerEditorFieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: 6,
  },
  optimizerEditorHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  optimizerEditorList: {
    gap: 8,
    paddingTop: 8,
  },
  optimizerSelector: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  optimizerSelectorActive: {
    borderColor: colors.accent,
  },
  optimizerToggleRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 2,
  },
  optimizerText: {
    flex: 1,
    minWidth: 0,
  },
  optimizerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  optimizerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  progressTrack: {
    backgroundColor: colors.backgroundRaised,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressValue: {
    backgroundColor: colors.accent,
    borderRadius: 3,
    height: '100%',
  },
  resetRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  resetText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  root: {
    backgroundColor: colors.background,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  settingsAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  settingsActionDanger: {
    borderColor: colors.dangerSoft,
  },
  settingsActionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsActionDetail: {
    color: colors.muted,
    fontSize: 12,
  },
})

function maintenanceSummary(
  estimate: LearningMaintenanceEstimate,
  translate: (key: string, options?: Record<string, number>) => string,
): string {
  return translate('maintenanceSummary', {
    events: estimate.reviewEvents,
    inactive: estimate.inactiveCards,
    targets: estimate.targets,
  })
}

const dailyGoalModes: readonly { id: LearningDailyGoalMode, label: string }[] = [
  { id: 'all-due', label: 'All due' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'spread-week', label: 'Spread week' },
]

const interdayOrders: readonly { id: LearningPracticeConfiguration['queuePolicy']['interdayOrder'], label: string }[] = [
  { id: 'before-reviews', label: 'Before reviews' },
  { id: 'after-reviews', label: 'After reviews' },
  { id: 'mixed', label: 'Mixed' },
]

const newGatherOrders: readonly { id: LearningPracticeConfiguration['queuePolicy']['newGatherOrder'], label: string }[] = [
  { id: 'source', label: 'Source order' },
  { id: 'random', label: 'Random' },
]

const reviewOrders: readonly { id: LearningPracticeConfiguration['queuePolicy']['reviewOrder'], label: string }[] = [
  { id: 'due-random', label: 'Due + random' },
  { id: 'retrievability', label: 'Retrievability' },
]

function PracticeSettings({
  onCancel,
  onSaved,
  runtime,
}: {
  onCancel: () => void
  onSaved: () => void
  runtime: MobileRuntime
}) {
  const { t } = useTranslation('learning')
  const [draft, setDraft] = useState(() => runtime.learningConfiguration.get())
  const [fixedCards, setFixedCards] = useState(() => String(draft.dailyGoal.fixedCards))
  const [maxNewCards, setMaxNewCards] = useState(() => String(draft.queuePolicy.maxNewCardsPerDay))
  const [learnAheadMinutes, setLearnAheadMinutes] = useState(() => String(draft.queuePolicy.learnAheadMinutes))
  const [studyDayStartsAtHour, setStudyDayStartsAtHour] = useState(() => String(draft.queuePolicy.studyDayStartsAtHour))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const updateQueuePolicy = <Key extends keyof LearningPracticeConfiguration['queuePolicy']>(key: Key, value: LearningPracticeConfiguration['queuePolicy'][Key]) => {
    setDraft(current => ({ ...current, queuePolicy: { ...current.queuePolicy, [key]: value } }))
  }

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const next = {
        ...draft,
        dailyGoal: {
          ...draft.dailyGoal,
          fixedCards: Number(fixedCards),
        },
        queuePolicy: {
          ...draft.queuePolicy,
          learnAheadMinutes: Number(learnAheadMinutes),
          maxNewCardsPerDay: Number(maxNewCards),
          studyDayStartsAtHour: Number(studyDayStartsAtHour),
        },
      }
      await runtime.learningConfiguration.save(next)
      onSaved()
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
    finally {
      setSaving(false)
    }
  }, [draft, fixedCards, learnAheadMinutes, maxNewCards, onSaved, runtime, studyDayStartsAtHour])

  return (
    <View style={styles.practiceSection}>
      <Text style={styles.practiceSectionTitle}>{t('dailyGoal')}</Text>
      <SegmentedControl options={dailyGoalModes.map(option => ({ ...option, label: option.id === 'all-due' ? t('allDue') : option.id === 'fixed' ? t('fixedDailyLimit') : t('spreadWeek') }))} selected={draft.dailyGoal.mode} onChange={mode => setDraft(current => ({ ...current, dailyGoal: { ...current.dailyGoal, mode } }))} />
      <Text style={styles.practiceFieldLabel}>{t('fixedCards')}</Text>
      <TextField containerStyle={styles.practiceField} keyboardType="number-pad" value={fixedCards} onChangeText={setFixedCards} />
      <Text style={styles.practiceFieldLabel}>{t('newCardsPerDay')}</Text>
      <TextField containerStyle={styles.practiceField} keyboardType="number-pad" value={maxNewCards} onChangeText={setMaxNewCards} />

      <Text style={styles.practiceSectionTitle}>{t('queuePolicy')}</Text>
      <Text style={styles.practiceFieldLabel}>{t('interdayLearningOrder')}</Text>
      <SegmentedControl options={interdayOrders.map(option => ({ ...option, label: option.id === 'before-reviews' ? t('beforeReviews') : option.id === 'after-reviews' ? t('afterReviews') : t('mixed') }))} selected={draft.queuePolicy.interdayOrder} onChange={value => updateQueuePolicy('interdayOrder', value)} />
      <Text style={styles.practiceFieldLabel}>{t('newCardOrder')}</Text>
      <SegmentedControl options={newGatherOrders.map(option => ({ ...option, label: option.id === 'source' ? t('sourceOrder') : t('randomOrder') }))} selected={draft.queuePolicy.newGatherOrder} onChange={value => updateQueuePolicy('newGatherOrder', value)} />
      <Text style={styles.practiceFieldLabel}>{t('reviewOrder')}</Text>
      <SegmentedControl options={reviewOrders.map(option => ({ ...option, label: option.id === 'due-random' ? t('dueRandom') : t('retrievability') }))} selected={draft.queuePolicy.reviewOrder} onChange={value => updateQueuePolicy('reviewOrder', value)} />
      <Text style={styles.practiceFieldLabel}>{t('learnAheadMinutes')}</Text>
      <TextField containerStyle={styles.practiceField} keyboardType="number-pad" value={learnAheadMinutes} onChangeText={setLearnAheadMinutes} />
      <Text style={styles.practiceFieldLabel}>{t('studyDayStartsAtHour')}</Text>
      <TextField containerStyle={styles.practiceField} keyboardType="number-pad" value={studyDayStartsAtHour} onChangeText={setStudyDayStartsAtHour} />

      <Text style={styles.practiceSectionTitle}>{t('siblingBurying')}</Text>
      <View style={styles.practiceSwitchRow}>
        <Text style={styles.practiceSwitchText}>{t('buryNewSiblings')}</Text>
        <Switch
          ios_backgroundColor={colors.backgroundRaised}
          thumbColor={draft.queuePolicy.buryNewSiblings ? colors.accentOn : colors.muted}
          trackColor={{ false: colors.backgroundRaised, true: colors.accent }}
          value={draft.queuePolicy.buryNewSiblings}
          onValueChange={value => updateQueuePolicy('buryNewSiblings', value)}
        />
      </View>
      <View style={styles.practiceSwitchRow}>
        <Text style={styles.practiceSwitchText}>{t('buryReviewSiblings')}</Text>
        <Switch
          ios_backgroundColor={colors.backgroundRaised}
          thumbColor={draft.queuePolicy.buryReviewSiblings ? colors.accentOn : colors.muted}
          trackColor={{ false: colors.backgroundRaised, true: colors.accent }}
          value={draft.queuePolicy.buryReviewSiblings}
          onValueChange={value => updateQueuePolicy('buryReviewSiblings', value)}
        />
      </View>
      <View style={styles.practiceSwitchRow}>
        <Text style={styles.practiceSwitchText}>{t('buryInterdaySiblings')}</Text>
        <Switch
          ios_backgroundColor={colors.backgroundRaised}
          thumbColor={draft.queuePolicy.buryInterdayLearningSiblings ? colors.accentOn : colors.muted}
          trackColor={{ false: colors.backgroundRaised, true: colors.accent }}
          value={draft.queuePolicy.buryInterdayLearningSiblings}
          onValueChange={value => updateQueuePolicy('buryInterdayLearningSiblings', value)}
        />
      </View>
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      <View style={styles.practiceActions}>
        <ActionButton label={t('cancelShort')} style={styles.actionFlex} onPress={onCancel} />
        <ActionButton
          disabled={saving}
          label={saving ? t('savingShort') : t('save')}
          leading={saving ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Ionicons color={colors.accentOn} name="checkmark" size={18} />}
          style={styles.actionFlex}
          tone="primary"
          onPress={() => void save()}
        />
      </View>
    </View>
  )
}

interface OptimizerDraft {
  desiredRetention: string
  enableFuzz: boolean
  fsrsParameters: string
  learningSteps: string
  maximumIntervalDays: string
  name: string
  relearningSteps: string
}

function optimizerDraft(optimizer: FsrsOptimizer, name = optimizer.name): OptimizerDraft {
  return {
    desiredRetention: String(Math.round(optimizer.configuration.desiredRetention * 100)),
    enableFuzz: optimizer.configuration.enableFuzz,
    fsrsParameters: optimizer.configuration.fsrsParameters.map(value => String(value)).join(', '),
    learningSteps: optimizer.configuration.learningSteps.join(', '),
    maximumIntervalDays: String(optimizer.configuration.maximumIntervalDays),
    name,
    relearningSteps: optimizer.configuration.relearningSteps.join(', '),
  }
}

function parseOptimizerSteps(value: string, label: string): readonly string[] {
  const steps = value.split(',').map(step => step.trim()).filter(step => step.length > 0)
  const pattern = /^(?:0|[1-9]\d*)(?:\.\d+)?[mhd]$/u
  if (steps.length === 0 || steps.some(step => !pattern.test(step)))
    throw new TypeError(`${label} must contain values such as 1m, 10m, or 1d`)
  return steps
}

function parseOptimizerParameters(value: string): readonly number[] {
  const values = value.split(',').map(parameter => parameter.trim()).filter(parameter => parameter.length > 0)
  const parameters = values.map(parameter => Number(parameter))
  if (parameters.length === 0 || parameters.some(parameter => !Number.isFinite(parameter)))
    throw new TypeError('FSRS parameters must be comma-separated finite numbers')
  return parameters
}

function OptimizerSettings({
  onSaved,
  optimizers,
  runtime,
}: {
  onSaved: () => void
  optimizers: readonly FsrsOptimizer[]
  runtime: MobileRuntime
}) {
  const { t } = useTranslation('learning')
  const globalOptimizer = optimizers.find(optimizer => optimizer.isGlobal) ?? optimizers[0]
  const [selectedId, setSelectedId] = useState<string | null>(globalOptimizer?.id ?? null)
  const [draft, setDraft] = useState<OptimizerDraft>(() => (
    globalOptimizer
      ? optimizerDraft(globalOptimizer)
      : {
          desiredRetention: '90',
          enableFuzz: true,
          fsrsParameters: '',
          learningSteps: '1m, 10m',
          maximumIntervalDays: '36500',
          name: 'New optimizer',
          relearningSteps: '10m',
        }
  ))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [rescheduleNow, setRescheduleNow] = useState(false)
  const selected = selectedId === null ? null : optimizers.find(optimizer => optimizer.id === selectedId) ?? null

  const selectOptimizer = (optimizer: FsrsOptimizer) => {
    setSelectedId(optimizer.id)
    setDraft(optimizerDraft(optimizer))
    setError(null)
  }

  const startNew = () => {
    if (!globalOptimizer)
      return
    setSelectedId(null)
    setDraft(optimizerDraft(globalOptimizer, 'New optimizer'))
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const desiredRetention = Number(draft.desiredRetention) / 100
      const maximumIntervalDays = Number(draft.maximumIntervalDays)
      if (!Number.isFinite(desiredRetention) || desiredRetention <= 0 || desiredRetention >= 1)
        throw new RangeError(t('desiredRetentionRange'))
      if (!Number.isSafeInteger(maximumIntervalDays) || maximumIntervalDays < 1)
        throw new RangeError(t('maximumIntervalPositive'))
      const configuration = {
        desiredRetention,
        enableFuzz: draft.enableFuzz,
        fsrsParameters: parseOptimizerParameters(draft.fsrsParameters),
        learningSteps: parseOptimizerSteps(draft.learningSteps, t('learningSteps')),
        maximumIntervalDays,
        relearningSteps: parseOptimizerSteps(draft.relearningSteps, t('relearningSteps')),
      }
      if (selected) {
        if (!selected.isGlobal && draft.name.trim().length === 0)
          throw new TypeError(t('optimizerNameRequired'))
        await runtime.editor.learning.optimizers.save({
          configuration,
          name: selected.isGlobal ? selected.name : draft.name.trim(),
          optimizerId: selected.id,
          rescheduleNow,
        })
      }
      else {
        const name = draft.name.trim()
        if (!name)
          throw new TypeError(t('optimizerNameRequired'))
        await runtime.editor.learning.optimizers.create({ configuration, name })
      }
      onSaved()
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
    finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!selected)
      return
    setSaving(true)
    setError(null)
    try {
      const next = await runtime.editor.learning.optimizers.resetDefaults(selected.id, rescheduleNow)
      setDraft(optimizerDraft(next))
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
    finally {
      setSaving(false)
    }
  }

  const optimize = async () => {
    if (!selected)
      return
    setSaving(true)
    setError(null)
    try {
      const next = await runtime.editor.learning.optimizers.optimize({ optimizerId: selected.id, rescheduleNow })
      setDraft(optimizerDraft(next))
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
    finally {
      setSaving(false)
    }
  }

  const archive = () => {
    if (!selected || selected.isGlobal)
      return
    Alert.alert(
      t('archiveOptimizerTitle'),
      t('archiveOptimizerMessage'),
      [
        { text: t('cancelShort'), style: 'cancel' },
        {
          text: t('archiveShort'),
          style: 'destructive',
          onPress: () => {
            setSaving(true)
            void runtime.editor.learning.optimizers.archive(selected.id).then(onSaved).catch((failure: unknown) => {
              setError(failure instanceof Error ? failure : new Error(String(failure)))
            }).finally(() => setSaving(false))
          },
        },
      ],
    )
  }

  return (
    <View style={styles.optimizerEditor}>
      <Text style={styles.modalSummary}>{t('globalOptimizerSummary')}</Text>
      <View style={styles.optimizerEditorActions}>
        <ActionButton
          disabled={saving || globalOptimizer === undefined}
          label={t('newOptimizerShort')}
          leading={<Ionicons color={colors.accent} name="add" size={18} />}
          style={styles.actionFlex}
          onPress={startNew}
        />
      </View>
      <View style={styles.optimizerEditorList}>
        {optimizers.map(optimizer => (
          <Pressable
            key={optimizer.id}
            disabled={saving}
            style={({ pressed }) => [
              styles.optimizerSelector,
              optimizer.id === selectedId && styles.optimizerSelectorActive,
              pressed && styles.rowPressed,
            ]}
            onPress={() => selectOptimizer(optimizer)}
          >
            <Ionicons color={optimizer.isGlobal ? colors.accent : colors.muted} name={optimizer.isGlobal ? 'globe-outline' : 'options-outline'} size={20} />
            <View style={styles.optimizerText}>
              <Text style={styles.optimizerTitle}>{optimizer.isGlobal ? t('globalOptimizerTitle') : optimizer.name}</Text>
              <Text style={styles.optimizerSubtitle}>
                {Math.round(optimizer.configuration.desiredRetention * 100)}
                {t('percentDesiredRetention')}
              </Text>
            </View>
            {optimizer.id === selectedId ? <Ionicons color={colors.accent} name="checkmark-circle" size={19} /> : null}
          </Pressable>
        ))}
      </View>
      <Text style={styles.practiceSectionTitle}>{selected ? (selected.isGlobal ? t('globalOptimizerTitle') : t('editOptimizer')) : t('newOptimizerShort')}</Text>
      <Text style={styles.optimizerEditorFieldLabel}>{t('name')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        editable={selected?.isGlobal !== true}
        value={draft.name}
        onChangeText={name => setDraft(current => ({ ...current, name }))}
      />
      <Text style={styles.optimizerEditorFieldLabel}>{t('desiredRetentionPercent')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        keyboardType="decimal-pad"
        value={draft.desiredRetention}
        onChangeText={desiredRetention => setDraft(current => ({ ...current, desiredRetention }))}
      />
      <Text style={styles.optimizerEditorFieldLabel}>{t('maximumIntervalDays')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        keyboardType="number-pad"
        value={draft.maximumIntervalDays}
        onChangeText={maximumIntervalDays => setDraft(current => ({ ...current, maximumIntervalDays }))}
      />
      <Text style={styles.optimizerEditorFieldLabel}>{t('learningSteps')}</Text>
      <Text style={styles.optimizerEditorHelp}>{t('stepsHelp')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        value={draft.learningSteps}
        onChangeText={learningSteps => setDraft(current => ({ ...current, learningSteps }))}
      />
      <Text style={styles.optimizerEditorFieldLabel}>{t('relearningSteps')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        value={draft.relearningSteps}
        onChangeText={relearningSteps => setDraft(current => ({ ...current, relearningSteps }))}
      />
      <Text style={styles.optimizerEditorFieldLabel}>{t('advanced')}</Text>
      <Text style={styles.optimizerEditorHelp}>{t('parametersHelp')}</Text>
      <TextField
        containerStyle={styles.optimizerEditorField}
        multiline
        value={draft.fsrsParameters}
        onChangeText={fsrsParameters => setDraft(current => ({ ...current, fsrsParameters }))}
      />
      <View style={styles.optimizerToggleRow}>
        <Text style={styles.practiceSwitchText}>{t('enableFuzzShort')}</Text>
        <Switch
          ios_backgroundColor={colors.backgroundRaised}
          thumbColor={draft.enableFuzz ? colors.accentOn : colors.muted}
          trackColor={{ false: colors.backgroundRaised, true: colors.accent }}
          value={draft.enableFuzz}
          onValueChange={enableFuzz => setDraft(current => ({ ...current, enableFuzz }))}
        />
      </View>
      <View style={styles.optimizerToggleRow}>
        <Text style={styles.practiceSwitchText}>{t('rescheduleExistingCards')}</Text>
        <Switch
          ios_backgroundColor={colors.backgroundRaised}
          thumbColor={rescheduleNow ? colors.accentOn : colors.muted}
          trackColor={{ false: colors.backgroundRaised, true: colors.accent }}
          value={rescheduleNow}
          onValueChange={setRescheduleNow}
        />
      </View>
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      <View style={styles.optimizerEditorActions}>
        <ActionButton
          disabled={saving || selected === null}
          label={t('defaults')}
          leading={<Ionicons color={colors.muted} name="refresh-outline" size={18} />}
          style={styles.actionFlex}
          onPress={() => void reset()}
        />
        <ActionButton
          disabled={saving || selected === null}
          label={t('optimize')}
          leading={<Ionicons color={colors.accent} name="sparkles-outline" size={18} />}
          style={styles.actionFlex}
          onPress={() => void optimize()}
        />
      </View>
      <View style={styles.optimizerEditorActions}>
        {!selected?.isGlobal
          ? (
              <ActionButton
                disabled={saving || selected === null}
                label={t('archiveShort')}
                leading={<Ionicons color={colors.danger} name="archive-outline" size={18} />}
                style={styles.actionFlex}
                tone="danger"
                onPress={archive}
              />
            )
          : null}
        <ActionButton
          disabled={saving}
          label={saving ? t('savingShort') : t('save')}
          leading={saving ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Ionicons color={colors.accentOn} name="checkmark" size={18} />}
          style={styles.actionFlex}
          tone="primary"
          onPress={() => void save()}
        />
      </View>
    </View>
  )
}

export function LearningOverview({ mode, onModeChange, onQueueChanged, runtime }: LearningOverviewProps) {
  const { t } = useTranslation('learning')
  const [activity, setActivity] = useState<LearningActivitySummary | null>(null)
  const [queue, setQueue] = useState<QueueSnapshot>({ items: [], mixed: 0, new: 0, review: 0 })
  const [error, setError] = useState<Error | null>(null)
  const [settingsView, setSettingsView] = useState<SettingsView>(null)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [maintenance, setMaintenance] = useState<LearningMaintenanceEstimate | null>(null)
  const [optimizers, setOptimizers] = useState<readonly FsrsOptimizer[]>([])
  const [resetQueue, setResetQueue] = useState<readonly LearningQueueItem[]>([])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [nextActivity, mixed, fresh, review] = await Promise.all([
        runtime.editor.learning.queue.getActivitySummary({ days: 28, now: Date.now() }),
        runtime.editor.learning.queue.list({ limit: 1000, mode: 'mixed', now: Date.now() }),
        runtime.editor.learning.queue.list({ limit: 1000, mode: 'new', now: Date.now() }),
        runtime.editor.learning.queue.list({ limit: 1000, mode: 'review', now: Date.now() }),
      ])
      setActivity(nextActivity)
      setQueue({ items: mixed, mixed: mixed.length, new: fresh.length, review: review.length })
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
  }, [runtime])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openSettings = useCallback(async (view: Exclude<SettingsView, null>) => {
    setSettingsView(view)
    setLoadingSettings(true)
    setError(null)
    try {
      if (view === 'maintenance')
        setMaintenance(await runtime.editor.learning.maintenance.getEstimate())
      else if (view === 'optimizer')
        setOptimizers(await runtime.editor.learning.optimizers.list())
      else if (view === 'reset')
        setResetQueue((await runtime.editor.learning.queue.list({ limit: 50, mode: 'mixed', now: Date.now() })).filter(item => item.targetIds.length > 0))
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
    finally {
      setLoadingSettings(false)
    }
  }, [runtime])

  const runMaintenance = useCallback(() => {
    if (!maintenance)
      return
    Alert.alert(
      t('databaseMaintenance'),
      t('cleanUpInactiveLearningData'),
      [
        { text: t('cancelShort'), style: 'cancel' },
        {
          text: t('cleanUpInactiveLearningData'),
          style: 'destructive',
          onPress: () => {
            void runtime.editor.learning.maintenance.maintain().then(() => {
              setSettingsView(null)
              void refresh()
              onQueueChanged()
            }).catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
          },
        },
      ],
    )
  }, [maintenance, onQueueChanged, refresh, runtime, t])

  const resetTarget = useCallback((targetId: string) => {
    Alert.alert(
      t('resetScheduling'),
      t('resetQueueDescription'),
      [
        { text: t('cancelShort'), style: 'cancel' },
        {
          text: t('resetScheduling'),
          style: 'destructive',
          onPress: () => {
            void runtime.editor.learning.reviews.resetTarget({ targetId }).then(() => {
              setResetQueue(current => current.filter(item => !item.targetIds.includes(targetId)))
              void refresh()
              onQueueChanged()
            }).catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
          },
        },
      ],
    )
  }, [onQueueChanged, refresh, runtime, t])

  const progress = activity?.dailyProgress ?? null
  const progressPercent = progress
    ? Math.min(1, progress.dailyGoalCards === 0 ? 0 : progress.completedCards / progress.dailyGoalCards)
    : 0
  const settingsTitle = settingsView === 'maintenance'
    ? t('databaseMaintenance')
    : settingsView === 'optimizer'
      ? t('fsrsOptimizers')
      : settingsView === 'practice'
        ? t('practiceSettings')
        : settingsView === 'reset'
          ? t('resetScheduling')
          : t('title')

  return (
    <>
      <View style={styles.root}>
        <GlassHeader
          subtitle={activity ? t('streakDays', { count: activity.currentStreakDays }) : t('localReview')}
          title={t('title')}
          trailing={(
            <IconButton accessibilityLabel={t('openSettings')} onPress={() => void openSettings('root')}>
              <Ionicons color={colors.text} name="options-outline" size={21} />
            </IconButton>
          )}
        />
        <View style={styles.activityBand}>
          <Text style={styles.activityTitle}>{t('todayProgress')}</Text>
          <Text style={styles.activity}>{progress ? t('progressCards', { completed: progress.completedCards, goal: progress.dailyGoalCards }) : t('loadingActivityShort')}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressValue, { width: `${progressPercent * 100}%` }]} />
          </View>
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('due')}</Text>
            <Text style={styles.metricValue}>{queue.review}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('newCards')}</Text>
            <Text style={styles.metricValue}>{queue.new}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>{t('streak')}</Text>
            <Text style={styles.metricValue}>
              {activity?.currentStreakDays ?? 0}
              d
            </Text>
          </View>
        </View>
        <SegmentedControl
          accessibilityLabel={t('learningQueue')}
          options={modes.map(option => ({ ...option, label: option.id === 'mixed' ? t('queueAll') : option.id === 'new' ? t('queueNew') : t('queueReview') }))}
          selected={mode}
          style={styles.modeControl}
          onChange={onModeChange}
        />
        {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      </View>
      <Modal animationType="slide" visible={settingsView !== null} onRequestClose={() => setSettingsView(null)}>
        <View style={styles.modalRoot}>
          <GlassHeader
            leading={settingsView !== null && settingsView !== 'root'
              ? (
                  <IconButton accessibilityLabel={t('backToLearningSettings')} onPress={() => void openSettings('root')}>
                    <Ionicons color={colors.text} name="chevron-back" size={22} />
                  </IconButton>
                )
              : undefined}
            title={settingsTitle}
            trailing={<IconButton accessibilityLabel={t('closeLearningSettings')} onPress={() => setSettingsView(null)}><Ionicons color={colors.text} name="close" size={22} /></IconButton>}
          />
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {loadingSettings
              ? <View style={styles.activityBand}><ActivityIndicator color={colors.accent} /></View>
              : settingsView === 'practice'
                ? (
                    <PracticeSettings
                      runtime={runtime}
                      onCancel={() => setSettingsView(null)}
                      onSaved={() => {
                        setSettingsView(null)
                        void refresh()
                        onQueueChanged()
                      }}
                    />
                  )
                : settingsView === 'maintenance'
                  ? (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>{t('databaseMaintenance')}</Text>
                        <Text style={styles.modalSummary}>{maintenance ? maintenanceSummary(maintenance, t) : t('noMaintenanceEstimate')}</Text>
                        <Pressable style={({ pressed }) => [styles.settingsAction, pressed && styles.rowPressed]} onPress={runMaintenance}>
                          <Ionicons color={colors.accent} name="sparkles-outline" size={19} />
                          <Text style={styles.settingsActionText}>{t('cleanUpInactiveLearningData')}</Text>
                        </Pressable>
                      </View>
                    )
                  : settingsView === 'reset'
                    ? (
                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>{t('resetScheduling')}</Text>
                          <Text style={styles.modalSummary}>{t('resetQueueDescription')}</Text>
                          {resetQueue.length === 0
                            ? <Text style={styles.modalSummary}>{t('noQueuedTargets')}</Text>
                            : resetQueue.map(item => (
                                <Pressable key={item.cardId} style={({ pressed }) => [styles.resetRow, pressed && styles.rowPressed]} onPress={() => item.targetIds[0] && resetTarget(item.targetIds[0])}>
                                  <Ionicons color={colors.muted} name="refresh-outline" size={19} />
                                  <Text numberOfLines={2} style={styles.resetText}>{item.cardId}</Text>
                                  <Ionicons color={colors.muted} name="chevron-forward" size={17} />
                                </Pressable>
                              ))}
                        </View>
                      )
                    : settingsView === 'optimizer'
                      ? (
                          <OptimizerSettings
                            optimizers={optimizers}
                            runtime={runtime}
                            onSaved={() => {
                              setSettingsView(null)
                              void refresh()
                              onQueueChanged()
                            }}
                          />
                        )
                      : (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>{t('reviewAndScheduling')}</Text>
                            <Text style={styles.modalSummary}>{t('sharedConfigurationDescription')}</Text>
                            <Pressable style={({ pressed }) => [styles.settingsAction, pressed && styles.rowPressed]} onPress={() => void openSettings('practice')}>
                              <Ionicons color={colors.accent} name="options-outline" size={20} />
                              <View style={styles.optimizerText}>
                                <Text style={styles.settingsActionText}>{t('practiceSettings')}</Text>
                                <Text style={styles.settingsActionDetail}>{t('practiceSettingsDescription')}</Text>
                              </View>
                              <Ionicons color={colors.muted} name="chevron-forward" size={17} />
                            </Pressable>
                            <Pressable style={({ pressed }) => [styles.settingsAction, pressed && styles.rowPressed]} onPress={() => void openSettings('optimizer')}>
                              <Ionicons color={colors.accent} name="analytics-outline" size={20} />
                              <View style={styles.optimizerText}>
                                <Text style={styles.settingsActionText}>{t('fsrsOptimizers')}</Text>
                                <Text style={styles.settingsActionDetail}>{t('fsrsOptimizersDescription')}</Text>
                              </View>
                              <Ionicons color={colors.muted} name="chevron-forward" size={17} />
                            </Pressable>
                            <Pressable style={({ pressed }) => [styles.settingsAction, pressed && styles.rowPressed]} onPress={() => void openSettings('maintenance')}>
                              <Ionicons color={colors.accent} name="construct-outline" size={20} />
                              <View style={styles.optimizerText}>
                                <Text style={styles.settingsActionText}>{t('databaseMaintenance')}</Text>
                                <Text style={styles.settingsActionDetail}>{t('databaseMaintenanceDescription')}</Text>
                              </View>
                              <Ionicons color={colors.muted} name="chevron-forward" size={17} />
                            </Pressable>
                            <Pressable style={({ pressed }) => [styles.settingsAction, styles.settingsActionDanger, pressed && styles.rowPressed]} onPress={() => void openSettings('reset')}>
                              <Ionicons color={colors.danger} name="refresh-circle-outline" size={20} />
                              <View style={styles.optimizerText}>
                                <Text style={styles.settingsActionText}>{t('resetScheduling')}</Text>
                                <Text style={styles.settingsActionDetail}>{t('resetSchedulingDescription')}</Text>
                              </View>
                              <Ionicons color={colors.muted} name="chevron-forward" size={17} />
                            </Pressable>
                          </View>
                        )}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}
