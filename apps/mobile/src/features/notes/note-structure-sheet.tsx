import type { NoteEntrySnapshot } from '@memorilo/editor/note'
import type {
  EditorSurfaceEntryType,
  EditorSurfaceStructure,
} from '@/surfaces/editor-surface-contract'
import { Ionicons } from '@expo/vector-icons'
import { projectVisibleNoteEntries } from '@memorilo/editor/note-tree'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ActionButton } from '@/ui/action-button'
import { GlassHeader } from '@/ui/glass-header'
import { IconButton } from '@/ui/icon-button'
import { TextField } from '@/ui/text-field'
import { colors, metrics } from '@/ui/theme'

type SheetMode = 'browse' | 'create' | 'edit'

interface NoteStructureSheetProps {
  onClose: () => void
  onCreateEntry: (input: {
    entryType: EditorSurfaceEntryType
    label: string
    parentId: string | null
  }) => Promise<EditorSurfaceStructure>
  onDeleteEntry: (input: {
    entryId: string
    strategy: 'delete-subtree' | 'promote-children'
  }) => Promise<EditorSurfaceStructure>
  onMoveEntry: (input: {
    entryId: string
    index?: number
    parentId: string | null
  }) => Promise<EditorSurfaceStructure>
  onOpenTopic: (topicId: string) => Promise<EditorSurfaceStructure>
  onRenameEntry: (entryId: string, label: string) => Promise<EditorSurfaceStructure>
  structure: EditorSurfaceStructure | null
  visible: boolean
}

const entryKinds: readonly { id: EditorSurfaceEntryType, label: string, icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'topic', label: 'Topic', icon: 'document-text-outline' },
  { id: 'folder', label: 'Folder', icon: 'folder-outline' },
  { id: 'spreadsheet', label: 'Spreadsheet', icon: 'grid-outline' },
  { id: 'whiteboard', label: 'Whiteboard', icon: 'brush-outline' },
]

const styles = StyleSheet.create({
  actionRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  actionRowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  actionText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 9,
  },
  addInside: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  body: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  choiceIcon: {
    color: colors.accent,
    fontSize: 18,
    width: 24,
  },
  choiceLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  choiceRow: {
    alignItems: 'center',
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: metrics.cornerControl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  choiceRowSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  choices: {
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 18,
  },
  content: {
    paddingBottom: 24,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 16,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  form: {
    paddingBottom: 8,
  },
  locationButton: {
    alignItems: 'center',
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: metrics.cornerControl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  locationLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  locationList: {
    backgroundColor: colors.backgroundRaised,
    borderRadius: metrics.cornerControl,
    marginHorizontal: 16,
    marginTop: 6,
    maxHeight: 220,
    overflow: 'hidden',
  },
  locationOption: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  locationOptionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingRight: 8,
  },
  rowCurrent: {
    backgroundColor: colors.accentSoft,
  },
  rowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    paddingVertical: 10,
  },
  rowOpen: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 18,
  },
  spacer: {
    flex: 1,
  },
  status: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    padding: 28,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginHorizontal: 16,
    marginTop: 18,
  },
})

function entryLabel(entry: NoteEntrySnapshot): string {
  return entry.kind === 'folder' ? entry.name : entry.title || 'Untitled Topic'
}

function entryType(entry: NoteEntrySnapshot): EditorSurfaceEntryType {
  if (entry.kind === 'folder')
    return 'folder'
  if (entry.topicType === 'spreadsheet')
    return 'spreadsheet'
  if (entry.topicType === 'whiteboard')
    return 'whiteboard'
  return 'topic'
}

function descendantsOf(entries: readonly NoteEntrySnapshot[], entryId: string): ReadonlySet<string> {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const entry of entries) {
      if (entry.parentId === entryId || (entry.parentId !== null && descendants.has(entry.parentId))) {
        if (!descendants.has(entry.id)) {
          descendants.add(entry.id)
          changed = true
        }
      }
    }
  }
  return descendants
}

function parentCandidates(
  entries: readonly NoteEntrySnapshot[],
  targetId: string | null,
  kind: EditorSurfaceEntryType,
): readonly NoteEntrySnapshot[] {
  let excluded = targetId === null ? new Set<string>() : descendantsOf(entries, targetId)
  if (targetId !== null)
    excluded = new Set(excluded).add(targetId)
  return entries.filter((entry) => {
    if (excluded.has(entry.id))
      return false
    if (kind === 'folder' && entry.kind !== 'folder')
      return false
    return true
  })
}

function ParentPicker({
  entries,
  kind,
  onChange,
  parentId,
  targetId,
}: {
  entries: readonly NoteEntrySnapshot[]
  kind: EditorSurfaceEntryType
  onChange: (parentId: string | null) => void
  parentId: string | null
  targetId: string | null
}) {
  const { t } = useTranslation('editor')
  const [expanded, setExpanded] = useState(false)
  const candidates = useMemo(() => parentCandidates(entries, targetId, kind), [entries, kind, targetId])
  const selectedLabel = parentId === null
    ? t('topLevel')
    : entryLabel(entries.find(entry => entry.id === parentId) ?? { id: parentId, kind: 'folder', name: parentId, ordinal: 0, parentId: null })
  return (
    <>
      <Pressable
        accessibilityLabel={t('chooseParent')}
        style={({ pressed }) => [styles.locationButton, pressed && styles.actionRowPressed]}
        onPress={() => setExpanded(value => !value)}
      >
        <Text style={styles.locationLabel}>{selectedLabel}</Text>
        <Ionicons color={colors.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      {expanded
        ? (
            <View style={styles.locationList}>
              <ScrollView nestedScrollEnabled>
                <Pressable
                  accessibilityState={{ selected: parentId === null }}
                  style={styles.locationOption}
                  onPress={() => {
                    onChange(null)
                    setExpanded(false)
                  }}
                >
                  <Text style={styles.locationOptionText}>{t('topLevel')}</Text>
                  {parentId === null ? <Ionicons color={colors.accent} name="checkmark" size={18} /> : null}
                </Pressable>
                {candidates.map(entry => (
                  <Pressable
                    key={entry.id}
                    accessibilityState={{ selected: parentId === entry.id }}
                    style={styles.locationOption}
                    onPress={() => {
                      onChange(entry.id)
                      setExpanded(false)
                    }}
                  >
                    <Text numberOfLines={1} style={[styles.locationOptionText, { paddingLeft: 16 }]}>
                      {entryLabel(entry)}
                    </Text>
                    {parentId === entry.id ? <Ionicons color={colors.accent} name="checkmark" size={18} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )
        : null}
    </>
  )
}

export function NoteStructureSheet({
  onClose,
  onCreateEntry,
  onDeleteEntry,
  onMoveEntry,
  onOpenTopic,
  onRenameEntry,
  structure,
  visible,
}: NoteStructureSheetProps) {
  const { t } = useTranslation('editor')
  const [mode, setMode] = useState<SheetMode>('browse')
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<ReadonlySet<string>>(() => new Set())
  const [draftKind, setDraftKind] = useState<EditorSurfaceEntryType>('topic')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftParentId, setDraftParentId] = useState<string | null>(null)
  const [targetEntryId, setTargetEntryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entries = useMemo(() => structure?.entries ?? [], [structure])
  const localizedEntryKinds = useMemo(() => entryKinds.map(kind => ({
    ...kind,
    label: kind.id === 'folder'
      ? t('folder')
      : kind.id === 'spreadsheet'
        ? t('spreadsheet.label')
        : kind.id === 'whiteboard'
          ? t('whiteboard')
          : t('topic'),
  })), [t])
  const targetEntry = targetEntryId === null ? null : entries.find(entry => entry.id === targetEntryId) ?? null
  const visibleEntries = useMemo(
    () => projectVisibleNoteEntries(entries, collapsedEntryIds),
    [collapsedEntryIds, entries],
  )

  const reset = () => {
    setMode('browse')
    setTargetEntryId(null)
    setError(null)
    setBusy(false)
  }

  const openCreate = (parentId: string | null = null, kind: EditorSurfaceEntryType = 'topic') => {
    setMode('create')
    setTargetEntryId(null)
    setDraftKind(kind)
    setDraftLabel('')
    setDraftParentId(parentId)
    setError(null)
  }

  const openEdit = (entry: NoteEntrySnapshot) => {
    setMode('edit')
    setTargetEntryId(entry.id)
    setDraftKind(entryType(entry))
    setDraftLabel(entryLabel(entry))
    setDraftParentId(entry.parentId)
    setError(null)
  }

  const runSave = async () => {
    const label = draftLabel.trim()
    if (label.length === 0) {
      setError(t('entryNameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') {
        await onCreateEntry({ entryType: draftKind, label, parentId: draftParentId })
      }
      else if (targetEntry) {
        if (label !== entryLabel(targetEntry))
          await onRenameEntry(targetEntry.id, label)
        if (draftParentId !== targetEntry.parentId)
          await onMoveEntry({ entryId: targetEntry.id, parentId: draftParentId })
      }
      reset()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setBusy(false)
    }
  }

  const runDelete = (strategy: 'delete-subtree' | 'promote-children') => {
    if (!targetEntry)
      return
    setBusy(true)
    setError(null)
    void onDeleteEntry({ entryId: targetEntry.id, strategy }).then(
      () => reset(),
      (cause: unknown) => {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }

  const confirmDelete = () => {
    if (!targetEntry)
      return
    const hasChildren = entries.some(entry => entry.parentId === targetEntry.id)
    Alert.alert(
      t('deleteEntryTitle', { label: entryLabel(targetEntry) }),
      hasChildren ? t('deleteEntryWithChildrenMessage') : t('deleteEntryMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        ...(hasChildren
          ? [{ text: t('keepChildren'), onPress: () => runDelete('promote-children') }]
          : []),
        { text: t('deleteEntry'), onPress: () => runDelete('delete-subtree'), style: 'destructive' },
      ],
    )
  }

  const moveBy = (delta: -1 | 1) => {
    if (!targetEntry)
      return
    const siblings = entries.filter(entry => entry.parentId === targetEntry.parentId)
    const currentIndex = siblings.findIndex(entry => entry.id === targetEntry.id)
    const nextIndex = currentIndex + delta
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length)
      return
    setBusy(true)
    void onMoveEntry({ entryId: targetEntry.id, index: nextIndex, parentId: targetEntry.parentId }).then(
      () => setBusy(false),
      (cause: unknown) => {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }

  const renderBrowse = () => (
    <>
      <GlassHeader
        title={t('noteStructure')}
        trailing={(
          <IconButton accessibilityLabel={t('addEntry')} onPress={() => openCreate()}>
            <Ionicons color={colors.accent} name="add" size={25} />
          </IconButton>
        )}
        leading={(
          <IconButton accessibilityLabel={t('closeNoteStructure')} onPress={onClose}>
            <Ionicons color={colors.text} name="chevron-back" size={22} />
          </IconButton>
        )}
      />
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}
      {structure === null
        ? <Text style={styles.status}>{t('openingNoteStructure')}</Text>
        : entries.length === 0
          ? <Text style={styles.status}>{t('noteStructureStart')}</Text>
          : (
              <ScrollView style={styles.body} contentContainerStyle={styles.content}>
                {visibleEntries.map(({ depth, entry, hasChildren }) => {
                  const collapsed = collapsedEntryIds.has(entry.id)
                  const current = entry.kind === 'topic' && entry.id === structure.selectedTopicId
                  return (
                    <View key={entry.id} style={[styles.row, current && styles.rowCurrent, { paddingLeft: 12 + depth * 20 }]}>
                      <Pressable
                        accessibilityLabel={t('openEntry', { label: entryLabel(entry) })}
                        style={({ pressed }) => [styles.rowOpen, pressed && styles.actionRowPressed]}
                        onPress={() => {
                          if (entry.kind === 'folder') {
                            if (hasChildren) {
                              setCollapsedEntryIds((currentIds) => {
                                const next = new Set(currentIds)
                                if (next.has(entry.id)) {
                                  next.delete(entry.id)
                                }
                                else {
                                  next.add(entry.id)
                                }
                                return next
                              })
                            }
                          }
                          else {
                            setBusy(true)
                            void onOpenTopic(entry.id).then(
                              () => {
                                setBusy(false)
                                onClose()
                              },
                              (cause: unknown) => {
                                setBusy(false)
                                setError(cause instanceof Error ? cause.message : String(cause))
                              },
                            )
                          }
                        }}
                      >
                        <Ionicons
                          color={entry.kind === 'folder' ? colors.muted : colors.accent}
                          name={entry.kind === 'folder' ? (collapsed ? 'folder-outline' : 'folder-open-outline') : entryType(entry) === 'spreadsheet' ? 'grid-outline' : entryType(entry) === 'whiteboard' ? 'brush-outline' : 'document-text-outline'}
                          size={19}
                        />
                        <View style={styles.spacer}>
                          <Text numberOfLines={1} style={styles.rowLabel}>{entryLabel(entry)}</Text>
                          {current ? <Text style={styles.rowMeta}>{t('currentTopic')}</Text> : null}
                        </View>
                      </Pressable>
                      <IconButton accessibilityLabel={t('editEntry', { label: entryLabel(entry) })} onPress={() => openEdit(entry)}>
                        <Ionicons color={colors.muted} name="ellipsis-horizontal" size={19} />
                      </IconButton>
                    </View>
                  )
                })}
              </ScrollView>
            )}
    </>
  )

  const renderForm = () => {
    const editing = mode === 'edit'
    const hasChildren = targetEntry !== null && entries.some(entry => entry.parentId === targetEntry.id)
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <GlassHeader
          title={editing ? t('editEntryTitle') : t('newEntryTitle')}
          leading={(
            <IconButton accessibilityLabel={t('backToNoteStructure')} onPress={() => setMode('browse')}>
              <Ionicons color={colors.text} name="chevron-back" size={22} />
            </IconButton>
          )}
        />
        {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {!editing
            ? (
                <>
                  <Text style={styles.sectionLabel}>{t('entryType')}</Text>
                  <View style={styles.choices}>
                    {localizedEntryKinds.map(kind => (
                      <Pressable
                        key={kind.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: draftKind === kind.id }}
                        style={[styles.choiceRow, draftKind === kind.id && styles.choiceRowSelected]}
                        onPress={() => {
                          setDraftKind(kind.id)
                          if (kind.id === 'folder' && draftParentId !== null) {
                            const parent = entries.find(entry => entry.id === draftParentId)
                            if (parent?.kind !== 'folder')
                              setDraftParentId(null)
                          }
                        }}
                      >
                        <Ionicons color={colors.accent} name={kind.icon} size={20} />
                        <Text style={styles.choiceLabel}>{kind.label}</Text>
                        {draftKind === kind.id ? <Ionicons color={colors.accent} name="checkmark" size={19} /> : null}
                      </Pressable>
                    ))}
                  </View>
                </>
              )
            : null}
          <Text style={styles.sectionLabel}>{editing ? t('name') : draftKind === 'folder' ? t('folderName') : t('topicTitle')}</Text>
          <TextField
            accessibilityLabel={editing ? t('entryName') : t('newEntryName')}
            autoFocus
            containerStyle={{ marginHorizontal: 16 }}
            maxLength={200}
            placeholder={draftKind === 'folder' ? t('folderName') : t('untitledTopic')}
            returnKeyType="done"
            value={draftLabel}
            onChangeText={(value) => {
              setDraftLabel(value)
              setError(null)
            }}
          />
          <Text style={styles.sectionLabel}>{t('location')}</Text>
          <ParentPicker
            entries={entries}
            kind={draftKind}
            parentId={draftParentId}
            targetId={targetEntryId}
            onChange={setDraftParentId}
          />
          {editing
            ? (
                <>
                  <Text style={styles.sectionLabel}>{t('order')}</Text>
                  <View style={styles.buttonRow}>
                    <ActionButton
                      disabled={busy}
                      label={t('moveUp')}
                      leading={<Ionicons color={colors.text} name="arrow-up" size={17} />}
                      style={styles.spacer}
                      onPress={() => moveBy(-1)}
                    />
                    <ActionButton
                      disabled={busy}
                      label={t('moveDown')}
                      leading={<Ionicons color={colors.text} name="arrow-down" size={17} />}
                      style={styles.spacer}
                      onPress={() => moveBy(1)}
                    />
                  </View>
                  <ActionButton
                    label={t('addInside')}
                    leading={<Ionicons color={colors.text} name="add-circle-outline" size={18} />}
                    style={[styles.addInside, { marginHorizontal: 16 }]}
                    onPress={() => openCreate(targetEntry?.id ?? null)}
                  />
                  <Text style={styles.sectionLabel}>{t('destructiveActions')}</Text>
                  <ActionButton
                    disabled={busy}
                    label={hasChildren ? t('deleteEntryWithChildren') : t('deleteEntry')}
                    leading={<Ionicons color={colors.danger} name="trash-outline" size={18} />}
                    style={{ marginHorizontal: 16 }}
                    tone="danger"
                    onPress={confirmDelete}
                  />
                </>
              )
            : null}
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.buttonRow}>
            <ActionButton disabled={busy} label={t('cancel')} style={styles.spacer} onPress={() => setMode('browse')} />
            <ActionButton
              disabled={busy || draftLabel.trim().length === 0}
              label={busy ? t('savingShort') : editing ? t('save') : t('create')}
              style={styles.spacer}
              tone="primary"
              onPress={() => void runSave()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    )
  }

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={() => {
        reset()
        onClose()
      }}
    >
      <SafeAreaView style={styles.body}>
        {mode === 'browse' ? renderBrowse() : renderForm()}
      </SafeAreaView>
    </Modal>
  )
}
