import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import type { CSSProperties, ReactNode } from 'react'
import type {
  TaskRepeatDayOfMonth,
  TaskRepeatMonthMode,
  TaskRepeatOrdinal,
  TaskRepeatRule,
  TaskRepeatUnit,
  TaskRepeatYearMode,
} from '../schema/task-schema'
import type { TaskCalendarEvent, TaskCalendarSubscription } from './task-calendar'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buttonStyles } from '../ui/button/button.stylex'
import { formControlStyles } from '../ui/form-controls/form-controls.stylex'
import { lunarDateForGregorian, previewTaskRecurrenceDates } from './task-recurrence'
import { taskRepeatPickerStyles as styles } from './task-repeat-picker.stylex'

export type TaskRepeatPickerMode = 'presets' | 'custom'

export interface TaskRepeatPickerProps {
  baseDate: string
  calendarEvents: readonly TaskCalendarEvent[]
  calendarSubscriptions: readonly TaskCalendarSubscription[]
  chinaRegion: boolean
  draft: TaskRepeatRule
  locale?: string
  mode: TaskRepeatPickerMode
  floatingOwnerId?: string
  onCancel: () => void
  onChange: (rule: TaskRepeatRule) => void
  onClose: () => void
  onDisable: () => void
  onEditCustom: () => void
  onFloatingRef: (element: HTMLDivElement | null) => void
  floatingStyle: CSSProperties
  t: TFunction
}

const weekdayKeys = [
  'weekdaySunday',
  'weekdayMonday',
  'weekdayTuesday',
  'weekdayWednesday',
  'weekdayThursday',
  'weekdayFriday',
  'weekdaySaturday',
] as const

const ordinalKeys: readonly { value: TaskRepeatOrdinal, key: string }[] = [
  { key: 'repeatFirst', value: 1 },
  { key: 'repeatSecond', value: 2 },
  { key: 'repeatThird', value: 3 },
  { key: 'repeatFourth', value: 4 },
  { key: 'repeatFifth', value: 5 },
  { key: 'repeatLast', value: -1 },
]

const dayOfMonthOptions: readonly { value: TaskRepeatDayOfMonth, label: string }[] = [
  ...Array.from({ length: 31 }, (_, index) => ({ label: String(index + 1), value: index + 1 })),
  { label: 'last', value: 'last' },
]

function monthDays(month: Dayjs): readonly Dayjs[] {
  const start = month.startOf('month').startOf('week')
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
}

function unitLabel(unit: TaskRepeatUnit, t: TFunction): string {
  return t(`repeat${unit.slice(0, 1).toUpperCase()}${unit.slice(1)}`)
}

function isPreset(rule: TaskRepeatRule, unit: TaskRepeatUnit): boolean {
  if (rule.unit !== unit || rule.interval !== 1 || rule.mode === 'custom')
    return false
  if (unit === 'week')
    return rule.weekdays?.length === 1
  if (unit === 'month')
    return rule.monthMode === undefined || rule.monthMode === 'date'
  if (unit === 'year')
    return rule.yearMode === undefined || rule.yearMode === 'date'
  return true
}

function ruleSummary(rule: TaskRepeatRule, baseDate: string, t: TFunction): string {
  if (rule.unit === 'week' && rule.weekdays?.length) {
    const names = rule.weekdays.map(day => t(weekdayKeys[day] ?? weekdayKeys[0])).join(', ')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${names}`
  }
  if (rule.unit === 'month' && rule.monthMode === 'weekday')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${t('repeatOrdinalWeekday', { ordinal: t(ordinalKeys.find(item => item.value === (rule.monthOrdinal ?? 1))?.key ?? 'repeatFirst'), weekday: t(weekdayKeys[rule.monthWeekday ?? dayjs(baseDate).day()] ?? weekdayKeys[0]) })}`
  if (rule.unit === 'month' && rule.monthMode === 'workday')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${t('repeatOrdinalWorkday', { ordinal: t(ordinalKeys.find(item => item.value === (rule.monthOrdinal ?? 1))?.key ?? 'repeatFirst') })}`
  if (rule.unit === 'lunar')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${rule.lunarMonth}/${rule.lunarDay}`
  return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)}`
}

function withDefaults(rule: TaskRepeatRule, baseDate: string): TaskRepeatRule {
  const value = dayjs(baseDate)
  return {
    ...rule,
    ...(rule.mode === 'custom' ? { anchorDate: rule.anchorDate ?? baseDate } : {}),
    ...(rule.unit === 'month'
      ? {
          monthDay: rule.monthDay ?? value.date(),
          monthMode: rule.monthMode ?? 'date',
          monthOrdinal: rule.monthOrdinal ?? 1,
          monthWeekday: rule.monthWeekday ?? value.day(),
        }
      : {}),
    ...(rule.unit === 'year'
      ? {
          yearDay: rule.yearDay ?? value.date(),
          yearMode: rule.yearMode ?? 'date',
          yearMonth: rule.yearMonth ?? value.month() + 1,
          yearOrdinal: rule.yearOrdinal ?? 1,
          yearWeekday: rule.yearWeekday ?? value.day(),
        }
      : {}),
    ...(rule.unit === 'lunar'
      ? (() => {
          const lunar = lunarDateForGregorian(baseDate)
          return { lunarDay: rule.lunarDay ?? lunar.day, lunarMonth: rule.lunarMonth ?? lunar.month }
        })()
      : {}),
  }
}

function presetRule(unit: TaskRepeatUnit, baseDate: string, calendarId: string, current: TaskRepeatRule): TaskRepeatRule {
  const value = dayjs(baseDate)
  const base = {
    ...current,
    interval: 1,
    mode: 'due' as const,
    unit,
    ...(calendarId.length > 0 ? { calendarId } : {}),
  }
  if (unit === 'week')
    return { ...base, weekdays: [value.day()] }
  if (unit === 'month')
    return { ...base, monthDay: value.date(), monthMode: 'date' }
  if (unit === 'year')
    return { ...base, yearDay: value.date(), yearMode: 'date', yearMonth: value.month() + 1 }
  if (unit === 'lunar') {
    const lunar = lunarDateForGregorian(baseDate)
    return { ...base, lunarDay: lunar.day, lunarMonth: lunar.month }
  }
  if (unit === 'day')
    return { ...base, skipHolidays: false, skipWeekends: false }
  if (unit === 'holiday')
    return { ...base, holidayPolicy: 'allow' }
  return { ...current, ...base }
}

function dateFormat(date: Dayjs, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date.toDate())
}

function monthFormat(date: Dayjs, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date.toDate())
}

function Select({
  children,
  onChange,
  value,
}: {
  children: ReactNode
  onChange: (value: string) => void
  value: string
}) {
  return <select {...stylex.props(formControlStyles.textInput, styles.input)} value={value} onChange={event => onChange(event.target.value)}>{children}</select>
}

function DayChoiceGrid({
  lastLabel,
  onChange,
  value,
}: {
  lastLabel: string
  onChange: (value: TaskRepeatDayOfMonth) => void
  value: TaskRepeatDayOfMonth
}) {
  return (
    <div {...stylex.props(styles.miniGrid)} role="group" aria-label={lastLabel}>
      {dayOfMonthOptions.map(item => (
        <button
          key={String(item.value)}
          {...stylex.props(styles.miniDay, item.value === 'last' && styles.miniDayLast, value === item.value && styles.miniDaySelected)}
          aria-pressed={value === item.value}
          type="button"
          onClick={() => onChange(item.value)}
        >
          {item.value === 'last' ? lastLabel : item.label}
        </button>
      ))}
    </div>
  )
}

export function TaskRepeatPicker({
  baseDate,
  calendarEvents,
  calendarSubscriptions,
  chinaRegion,
  draft,
  floatingStyle,
  floatingOwnerId,
  locale,
  mode,
  onCancel,
  onChange,
  onClose,
  onDisable,
  onEditCustom,
  onFloatingRef,
  t,
}: TaskRepeatPickerProps) {
  const normalized = withDefaults(draft, baseDate)
  const [activeMonth, setActiveMonth] = useState(() => dayjs(normalized.anchorDate ?? baseDate).startOf('month'))
  const activeDays = useMemo(() => monthDays(activeMonth), [activeMonth])
  const previewDates = useMemo(() => previewTaskRecurrenceDates(baseDate, normalized, {
    calendarEvents,
    from: activeMonth.startOf('month').format('YYYY-MM-DD'),
    through: activeMonth.endOf('month').format('YYYY-MM-DD'),
  }), [activeMonth, baseDate, calendarEvents, normalized])
  const selectedCalendarId = normalized.calendarId ?? calendarSubscriptions.find(item => item.enabled)?.id ?? ''
  const patchRule = (patch: Partial<TaskRepeatRule>) => onChange(withDefaults({ ...normalized, ...patch }, baseDate))
  const chooseUnit = (nextUnit: TaskRepeatUnit) => {
    const next = withDefaults({ ...normalized, unit: nextUnit }, baseDate)
    onChange(next)
  }
  const chooseCustom = () => {
    onChange(withDefaults({ ...normalized, mode: 'custom', anchorDate: normalized.anchorDate ?? baseDate }, baseDate))
    onEditCustom()
  }

  if (mode === 'presets') {
    const presets: readonly { id: TaskRepeatUnit | 'custom' | 'workday', label: string }[] = [
      { id: 'day', label: t('repeatPresetDaily') },
      { id: 'week', label: t('repeatPresetWeekly') },
      { id: 'month', label: t('repeatPresetMonthly') },
      { id: 'year', label: t('repeatPresetYearly') },
      { id: 'workday', label: t('repeatPresetWorkdays') },
      { id: 'holiday', label: t('repeatPresetHolidays') },
      ...(chinaRegion ? [{ id: 'lunar' as const, label: t('repeatPresetLunar') }] : []),
      { id: 'custom', label: t('repeatPresetCustom') },
    ]
    return (
      <div ref={onFloatingRef} {...stylex.props(styles.popover)} data-task-action-floating-owner={floatingOwnerId} style={floatingStyle} role="dialog" aria-label={t('repeatSettings')}>
        <div {...stylex.props(styles.presetList)}>
          <button {...stylex.props(styles.preset)} type="button" onClick={onDisable}>
            <span>{t('repeatNone')}</span>
          </button>
          {presets.map((preset) => {
            const selected = preset.id === 'custom'
              ? normalized.mode === 'custom'
              : preset.id === 'workday'
                ? normalized.unit === 'day' && normalized.skipWeekends === true
                : isPreset(normalized, preset.id)
            return (
              <button
                key={preset.id}
                {...stylex.props(styles.preset)}
                type="button"
                onClick={() => {
                  if (preset.id === 'custom') {
                    chooseCustom()
                    return
                  }
                  if (preset.id === 'workday') {
                    onChange({ ...presetRule('day', baseDate, selectedCalendarId, normalized), skipHolidays: selectedCalendarId.length > 0, skipWeekends: true })
                    onClose()
                    return
                  }
                  onChange(presetRule(preset.id, baseDate, selectedCalendarId, normalized))
                  onClose()
                }}
              >
                <span>{preset.label}</span>
                <span {...stylex.props(styles.presetSummary)}>
                  {selected ? <Check aria-hidden="true" size={15} strokeWidth={2.1} /> : preset.id === 'custom' ? t('repeatConfigure') : ruleSummary(presetRule(preset.id === 'workday' ? 'day' : preset.id, baseDate, selectedCalendarId, normalized), baseDate, t)}
                </span>
              </button>
            )
          })}
        </div>
        {normalized.mode === 'custom'
          ? (
              <button {...stylex.props(formControlStyles.primaryButton, styles.footerButton)} type="button" onClick={onClose}>{t('confirmSchedule')}</button>
            )
          : null}
      </div>
    )
  }

  const ordinalOptions = ordinalKeys.map(item => <option key={item.value} value={item.value}>{t(item.key)}</option>)
  const monthOptions = Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{t('monthNumber', { count: index + 1 })}</option>)
  const setMode = (value: TaskRepeatRule['mode']) => onChange(withDefaults({ ...normalized, mode: value, ...(value === 'custom' ? { anchorDate: normalized.anchorDate ?? baseDate } : {}) }, baseDate))
  const anchorDate = normalized.anchorDate ?? baseDate
  const canSelectAnchor = (date: string) => date >= baseDate

  return (
    <div ref={onFloatingRef} {...stylex.props(styles.popover, styles.customPopover)} data-task-action-floating-owner={floatingOwnerId} style={floatingStyle} role="dialog" aria-label={t('repeatSettings')}>
      <div {...stylex.props(styles.heading)}>
        <span>{t('repeatSettings')}</span>
        <button {...stylex.props(buttonStyles.action)} aria-label={t('backToRepeatPresets')} title={t('backToRepeatPresets')} type="button" onClick={onClose}>×</button>
      </div>
      <div {...stylex.props(styles.content)}>
        <label {...stylex.props(styles.field)}>
          <span>{t('repeatReference')}</span>
          <Select value={normalized.mode} onChange={value => setMode(value as TaskRepeatRule['mode'])}>
            <option value="due">{t('repeatDue')}</option>
            <option value="completion">{t('repeatCompletion')}</option>
            <option value="custom">{t('repeatCustomDate')}</option>
          </Select>
        </label>
        <div {...stylex.props(styles.selectRow)}>
          <label {...stylex.props(styles.field)}>
            <span>{t('repeatEvery')}</span>
            <input {...stylex.props(styles.input)} min={1} max={999} type="number" value={normalized.interval} onChange={event => patchRule({ interval: Number(event.target.value) })} />
          </label>
          <label {...stylex.props(styles.field)}>
            <span>{t('repeatUnit')}</span>
            <Select value={normalized.unit} onChange={value => chooseUnit(value as TaskRepeatUnit)}>
              <option value="day">{t('repeatDay')}</option>
              <option value="week">{t('repeatWeek')}</option>
              <option value="month">{t('repeatMonth')}</option>
              <option value="year">{t('repeatYear')}</option>
              {chinaRegion ? <option value="lunar">{t('repeatLunar')}</option> : null}
              <option value="holiday">{t('repeatHoliday')}</option>
            </Select>
          </label>
        </div>

        {normalized.mode === 'custom'
          ? (
              <div {...stylex.props(styles.miniMonth)}>
                <div {...stylex.props(styles.miniMonthHeader)}>
                  <button {...stylex.props(styles.iconButton)} aria-label={t('previousMonth')} type="button" onClick={() => setActiveMonth(current => current.subtract(1, 'month'))}><ChevronLeft aria-hidden="true" size={14} /></button>
                  <span>{monthFormat(activeMonth, locale)}</span>
                  <button {...stylex.props(styles.iconButton)} aria-label={t('nextMonth')} type="button" onClick={() => setActiveMonth(current => current.add(1, 'month'))}><ChevronRight aria-hidden="true" size={14} /></button>
                </div>
                <div {...stylex.props(styles.miniWeekdays, styles.anchorWeekdays)} aria-hidden="true">{weekdayKeys.map(key => <span key={key}>{t(key)}</span>)}</div>
                <div {...stylex.props(styles.miniGrid, styles.anchorGrid)} role="grid" aria-label={t('repeatCustomDate')}>
                  {activeDays.map((day) => {
                    const date = day.format('YYYY-MM-DD')
                    const inMonth = day.month() === activeMonth.month()
                    const selected = date === anchorDate
                    const preview = previewDates.includes(date)
                    return <button key={date} {...stylex.props(styles.miniDay, styles.anchorDay, !inMonth && styles.miniDayMuted, selected && styles.miniDaySelected, preview && !selected && styles.miniDayPreview)} aria-pressed={selected} disabled={!canSelectAnchor(date)} type="button" onClick={() => patchRule({ anchorDate: date })}>{day.date()}</button>
                  })}
                </div>
              </div>
            )
          : null}

        {normalized.unit === 'week'
          ? (
              <div {...stylex.props(styles.weekdayRow)} aria-label={t('repeatOn')} role="group">
                {weekdayKeys.map((key, weekday) => (
                  <button
                    key={key}
                    {...stylex.props(styles.weekday, normalized.weekdays?.includes(weekday) && styles.weekdaySelected)}
                    aria-pressed={normalized.weekdays?.includes(weekday) ?? false}
                    type="button"
                    onClick={() => {
                      const current = normalized.weekdays ?? []
                      const next = current.includes(weekday) ? current.filter(item => item !== weekday) : [...current, weekday].sort((left, right) => left - right)
                      if (next.length > 0)
                        patchRule({ weekdays: next })
                    }}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            )
          : null}

        {normalized.unit === 'month'
          ? (
              <>
                <div {...stylex.props(styles.segmented)} role="tablist" aria-label={t('repeatMonthMode')}>
                  {(['date', 'weekday', 'workday'] as const).map(value => <button key={value} {...stylex.props(styles.segment, normalized.monthMode === value && styles.segmentSelected)} aria-selected={normalized.monthMode === value} role="tab" type="button" onClick={() => patchRule({ monthMode: value as TaskRepeatMonthMode })}>{t(`repeatMonthBy${value.slice(0, 1).toUpperCase()}${value.slice(1)}`)}</button>)}
                </div>
                {normalized.monthMode === 'date'
                  ? (
                      <div {...stylex.props(styles.field)}>
                        <span>{t('repeatDayOfMonth')}</span>
                        <DayChoiceGrid lastLabel={t('repeatLastDay')} onChange={value => patchRule({ monthDay: value })} value={normalized.monthDay ?? dayjs(baseDate).date()} />
                      </div>
                    )
                  : null}
                {normalized.monthMode === 'weekday'
                  ? (
                      <div {...stylex.props(styles.selectRow)}>
                        <label {...stylex.props(styles.field)}>
                          <span>{t('repeatOrdinal')}</span>
                          <Select value={String(normalized.monthOrdinal ?? 1)} onChange={value => patchRule({ monthOrdinal: Number(value) as TaskRepeatOrdinal })}>{ordinalOptions}</Select>
                        </label>
                        <label {...stylex.props(styles.field)}>
                          <span>{t('repeatWeekday')}</span>
                          <Select value={String(normalized.monthWeekday ?? dayjs(baseDate).day())} onChange={value => patchRule({ monthWeekday: Number(value) })}>{weekdayKeys.map((key, index) => <option key={key} value={index}>{t(key)}</option>)}</Select>
                        </label>
                      </div>
                    )
                  : null}
                {normalized.monthMode === 'workday'
                  ? (
                      <label {...stylex.props(styles.field)}>
                        <span>{t('repeatWorkdayOrdinal')}</span>
                        <Select value={String(normalized.monthOrdinal ?? 1)} onChange={value => patchRule({ monthOrdinal: Number(value) as TaskRepeatOrdinal })}>{ordinalOptions}</Select>
                      </label>
                    )
                  : null}
              </>
            )
          : null}

        {normalized.unit === 'year'
          ? (
              <>
                <div {...stylex.props(styles.segmented, styles.segmentedTwo)} role="tablist" aria-label={t('repeatYearMode')}>
                  {(['date', 'weekday'] as const).map(value => <button key={value} {...stylex.props(styles.segment, normalized.yearMode === value && styles.segmentSelected)} aria-selected={normalized.yearMode === value} role="tab" type="button" onClick={() => patchRule({ yearMode: value as TaskRepeatYearMode })}>{t(`repeatYearBy${value.slice(0, 1).toUpperCase()}${value.slice(1)}`)}</button>)}
                </div>
                <label {...stylex.props(styles.field)}>
                  <span>{t('repeatMonthOfYear')}</span>
                  <Select value={String(normalized.yearMonth ?? dayjs(baseDate).month() + 1)} onChange={value => patchRule({ yearMonth: Number(value) })}>{monthOptions}</Select>
                </label>
                {normalized.yearMode === 'date'
                  ? (
                      <div {...stylex.props(styles.field)}>
                        <span>{t('repeatDayOfMonth')}</span>
                        <DayChoiceGrid lastLabel={t('repeatLastDay')} onChange={value => patchRule({ yearDay: value })} value={normalized.yearDay ?? dayjs(baseDate).date()} />
                      </div>
                    )
                  : (
                      <div {...stylex.props(styles.selectRow)}>
                        <label {...stylex.props(styles.field)}>
                          <span>{t('repeatOrdinal')}</span>
                          <Select value={String(normalized.yearOrdinal ?? 1)} onChange={value => patchRule({ yearOrdinal: Number(value) as TaskRepeatOrdinal })}>{ordinalOptions}</Select>
                        </label>
                        <label {...stylex.props(styles.field)}>
                          <span>{t('repeatWeekday')}</span>
                          <Select value={String(normalized.yearWeekday ?? dayjs(baseDate).day())} onChange={value => patchRule({ yearWeekday: Number(value) })}>{weekdayKeys.map((key, index) => <option key={key} value={index}>{t(key)}</option>)}</Select>
                        </label>
                      </div>
                    )}
              </>
            )
          : null}

        {normalized.unit === 'lunar'
          ? (
              <div {...stylex.props(styles.selectRow)}>
                <label {...stylex.props(styles.field)}>
                  <span>{t('repeatLunarMonth')}</span>
                  <Select value={String(normalized.lunarMonth ?? 1)} onChange={value => patchRule({ lunarMonth: Number(value) })}>{monthOptions}</Select>
                </label>
                <label {...stylex.props(styles.field)}>
                  <span>{t('repeatLunarDay')}</span>
                  <Select value={String(normalized.lunarDay ?? 1)} onChange={value => patchRule({ lunarDay: Number(value) })}>{Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</Select>
                </label>
              </div>
            )
          : null}

        {normalized.unit === 'holiday'
          ? (
              <label {...stylex.props(styles.field)}>
                <span>{t('repeatCalendar')}</span>
                <Select value={selectedCalendarId} onChange={value => patchRule({ calendarId: value })}>{calendarSubscriptions.map(subscription => <option key={subscription.id} value={subscription.id}>{subscription.title}</option>)}</Select>
              </label>
            )
          : null}
        {normalized.unit !== 'holiday' && normalized.unit !== 'lunar'
          ? (
              <>
                <label {...stylex.props(styles.checkboxRow)}>
                  <input {...stylex.props(styles.checkbox)} checked={normalized.skipHolidays === true} type="checkbox" onChange={event => patchRule({ skipHolidays: event.target.checked, ...(event.target.checked && selectedCalendarId.length > 0 ? { calendarId: selectedCalendarId } : {}) })} />
                  {t('repeatSkipHolidays')}
                </label>
                {(normalized.unit === 'day' || normalized.monthMode === 'workday')
                  ? (
                      <label {...stylex.props(styles.checkboxRow)}>
                        <input {...stylex.props(styles.checkbox)} checked={normalized.skipWeekends === true} type="checkbox" onChange={event => patchRule({ skipWeekends: event.target.checked })} />
                        {t('repeatSkipWeekends')}
                      </label>
                    )
                  : null}
              </>
            )
          : null}
        {normalized.mode === 'custom' ? <p {...stylex.props(styles.note)}>{t('repeatCustomPreview', { date: dateFormat(dayjs(anchorDate), locale) })}</p> : null}
        <label {...stylex.props(styles.field)}>
          <span>{t('repeatEnd')}</span>
          <Select value={normalized.endDate === undefined ? '' : 'date'} onChange={value => patchRule({ endDate: value === '' ? undefined : normalized.endDate ?? baseDate })}>
            <option value="">{t('repeatForever')}</option>
            <option value="date">{t('repeatEndOnDate')}</option>
          </Select>
        </label>
        {normalized.endDate !== undefined ? <input {...stylex.props(styles.input)} min={baseDate} type="date" value={normalized.endDate} onChange={event => patchRule({ endDate: event.target.value })} /> : null}
      </div>
      <div {...stylex.props(styles.footer)}>
        <button {...stylex.props(buttonStyles.action, styles.footerButton)} type="button" onClick={onCancel}>{t('cancel')}</button>
        <button {...stylex.props(formControlStyles.primaryButton, styles.footerButton)} type="button" onClick={onClose}>{t('confirmSchedule')}</button>
      </div>
    </div>
  )
}
