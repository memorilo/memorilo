export type SyncAuditActorType = 'anonymous' | 'browser' | 'device' | 'system'

export type SyncAuditOutcome = 'success' | 'denied' | 'failure'

export interface SyncAuditEvent {
  readonly id: string
  readonly accountId: string | null
  readonly action: string
  readonly actorType: SyncAuditActorType
  readonly actorId: string | null
  readonly outcome: SyncAuditOutcome
  readonly requestId: string
  readonly remoteAddress: string | null
  readonly details: Readonly<Record<string, boolean | number | string | null>>
  readonly createdAt: number
}

export interface SyncAuditStore {
  readonly append: (event: SyncAuditEvent) => Promise<void>
  readonly listForAccount: (accountId: string, limit: number, before?: number) => Promise<readonly SyncAuditEvent[]>
}
