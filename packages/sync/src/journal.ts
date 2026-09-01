import type { LocalSyncChangeInput } from './journal-contract'
import type { DeviceId, SyncChange, SyncDataNamespace, VersionVector } from './model'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeVersionVector } from './model'

export type { LocalSyncChangeInput } from './journal-contract'

interface PersistedSyncJournal {
  readonly version: 1
  deviceId: DeviceId | null
  nextSequence: number
  changes: SyncChange[]
  receivedVersionVector: Record<string, number>
  pendingReceivedSequences: Record<string, number[]>
}

function emptyJournal(): PersistedSyncJournal {
  return {
    changes: [],
    deviceId: null,
    nextSequence: 1,
    pendingReceivedSequences: {},
    receivedVersionVector: {},
    version: 1,
  }
}

function assertSequence(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${label} must be a positive safe integer`)
}

function namespaceForChange(change: Pick<SyncChange, 'kind'>): SyncDataNamespace {
  return change.kind === 'note-update' ? 'notes' : 'learning'
}

function parseJournal(value: unknown): PersistedSyncJournal {
  if (typeof value !== 'object' || value === null)
    throw new TypeError('P2P sync journal must contain an object')
  const candidate = value as Partial<PersistedSyncJournal>
  if (candidate.version !== 1 || !Array.isArray(candidate.changes))
    throw new TypeError('Unsupported P2P sync journal version')
  assertSequence(candidate.nextSequence, 'P2P sync journal next sequence')
  const deviceId = candidate.deviceId === null || typeof candidate.deviceId === 'string'
    ? candidate.deviceId
    : undefined
  if (deviceId === undefined)
    throw new TypeError('P2P sync journal device id is invalid')
  const receivedVersionVector = normalizeVersionVector(candidate.receivedVersionVector ?? {})
  const pendingReceivedSequences: Record<string, number[]> = {}
  for (const [sourceDeviceId, sequences] of Object.entries(candidate.pendingReceivedSequences ?? {})) {
    if (!Array.isArray(sequences))
      throw new TypeError('P2P sync journal pending sequences are invalid')
    const normalized = [...new Set(sequences.map((sequence) => {
      assertSequence(sequence, 'P2P sync journal pending sequence')
      return sequence
    }))].sort((left, right) => left - right)
    if (normalized.length > 0)
      pendingReceivedSequences[sourceDeviceId] = normalized
  }
  const changes = candidate.changes.map((change) => {
    if (typeof change !== 'object' || change === null)
      throw new TypeError('P2P sync journal change is invalid')
    const current = change as Partial<SyncChange>
    if (typeof current.id !== 'string' || current.id.length === 0
      || typeof current.deviceId !== 'string' || current.deviceId.length === 0
      || (current.kind !== 'note-update' && current.kind !== 'learning-mutation')
      || typeof current.payload !== 'string') {
      throw new TypeError('P2P sync journal change is invalid')
    }
    assertSequence(current.sequence, 'P2P sync journal change sequence')
    return {
      deviceId: current.deviceId,
      id: current.id,
      kind: current.kind,
      payload: current.payload,
      sequence: current.sequence,
    }
  })
  return {
    changes,
    deviceId,
    nextSequence: candidate.nextSequence,
    pendingReceivedSequences,
    receivedVersionVector: { ...receivedVersionVector },
    version: 1,
  }
}

export class JsonSyncJournal {
  #state: PersistedSyncJournal = emptyJournal()
  #loaded = false
  #mutationQueue: Promise<void> = Promise.resolve()

  constructor(readonly path: string) {}

  async load(): Promise<void> {
    if (this.#loaded)
      return
    try {
      this.#state = parseJournal(JSON.parse(await readFile(this.path, 'utf8')) as unknown)
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw error
      this.#state = emptyJournal()
      await this.#save()
    }
    this.#loaded = true
  }

  get deviceId(): DeviceId | null {
    this.#assertLoaded()
    return this.#state.deviceId
  }

  getVersionVector(namespace?: SyncDataNamespace): VersionVector {
    this.#assertLoaded()
    if (namespace === undefined)
      return this.#combinedVersionVector()
    const vector: Record<string, number> = {}
    for (const change of this.#state.changes) {
      if (namespaceForChange(change) === namespace)
        vector[change.deviceId] = Math.max(vector[change.deviceId] ?? 0, change.sequence)
    }
    return normalizeVersionVector(vector)
  }

  listChanges(since: VersionVector, namespace?: SyncDataNamespace): readonly SyncChange[] {
    this.#assertLoaded()
    const normalized = normalizeVersionVector(since)
    return this.#state.changes
      .filter(change => (namespace === undefined || namespaceForChange(change) === namespace)
        && change.sequence > (normalized[change.deviceId] ?? 0))
      .map(change => ({ ...change }))
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId) || left.sequence - right.sequence)
  }

  async setDeviceId(deviceId: DeviceId): Promise<void> {
    await this.#enqueue(async () => {
      this.#assertLoaded()
      if (!deviceId)
        throw new TypeError('P2P sync journal device id is required')
      if (this.#state.deviceId !== null && this.#state.deviceId !== deviceId)
        throw new Error('P2P sync journal device id cannot change')
      if (this.#state.deviceId === deviceId)
        return
      this.#state.deviceId = deviceId
      await this.#save()
    })
  }

  async appendLocal(input: LocalSyncChangeInput): Promise<SyncChange> {
    return this.#enqueue(async () => {
      this.#assertLoaded()
      if (!input.id)
        throw new TypeError('P2P sync change id is required')
      const existing = this.#state.changes.find(change => change.id === input.id)
      if (existing)
        return { ...existing }
      if (this.#state.deviceId === null)
        throw new Error('P2P sync journal device id is not initialized')
      const change: SyncChange = {
        deviceId: this.#state.deviceId,
        id: input.id,
        kind: input.kind,
        payload: input.payload,
        sequence: this.#state.nextSequence,
      }
      this.#state.nextSequence += 1
      this.#state.changes.push(change)
      await this.#save()
      return { ...change }
    })
  }

  async recordReceived(changes: readonly SyncChange[]): Promise<void> {
    await this.recordReceivedAndReport(changes)
  }

  async recordReceivedAndReport(changes: readonly SyncChange[]): Promise<boolean> {
    return this.#enqueue(async () => {
      this.#assertLoaded()
      let acceptedNewChange = false
      const knownChangeIds = new Set(this.#state.changes.map(change => change.id))
      for (const change of changes) {
        assertSequence(change.sequence, 'Received P2P sync change sequence')
        if (!knownChangeIds.has(change.id)) {
          this.#state.changes.push({ ...change })
          knownChangeIds.add(change.id)
          acceptedNewChange = true
        }
        const cursor = this.#state.receivedVersionVector[change.deviceId] ?? 0
        if (change.sequence <= cursor)
          continue
        const pending = new Set(this.#state.pendingReceivedSequences[change.deviceId] ?? [])
        pending.add(change.sequence)
        let nextCursor = cursor
        while (pending.delete(nextCursor + 1))
          nextCursor += 1
        this.#state.receivedVersionVector[change.deviceId] = nextCursor
        const remaining = [...pending].sort((left, right) => left - right)
        if (remaining.length > 0)
          this.#state.pendingReceivedSequences[change.deviceId] = remaining
        else
          delete this.#state.pendingReceivedSequences[change.deviceId]
      }
      await this.#save()
      return acceptedNewChange
    })
  }

  async #enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const previous = this.#mutationQueue
    let release!: () => void
    this.#mutationQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    }
    finally {
      release()
    }
  }

  #combinedVersionVector(): VersionVector {
    const vector: Record<string, number> = { ...this.#state.receivedVersionVector }
    if (this.#state.deviceId !== null) {
      for (const change of this.#state.changes) {
        if (change.deviceId === this.#state.deviceId)
          vector[change.deviceId] = Math.max(vector[change.deviceId] ?? 0, change.sequence)
      }
    }
    return normalizeVersionVector(vector)
  }

  #assertLoaded(): void {
    if (!this.#loaded)
      throw new Error('P2P sync journal must be loaded before use')
  }

  async #save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.tmp-${randomUUID()}`
    await writeFile(temporaryPath, `${JSON.stringify(this.#state)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, this.path)
  }
}
