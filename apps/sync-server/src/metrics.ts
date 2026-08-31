import type { SyncPeerMetrics, SyncPeerMetricsRecorder } from '../infrastructure/metrics'

export type { SyncPeerMetrics, SyncPeerMetricsRecorder } from '../infrastructure/metrics'

export interface SyncServerMetricsSnapshot extends SyncPeerMetrics {
  readonly httpRequests: number
  readonly httpRequestsInFlight: number
  readonly httpFailures: number
  readonly authenticationRejections: number
  readonly rateLimitRejections: number
  readonly relayDeliveries: number
  readonly relayDeliveryFailures: number
  readonly relayDrops: number
  readonly authoritativeCommits: number
  readonly authoritativeCommitLatencyMs: number
  readonly databaseFailures: number
  readonly objectStoreFailures: number
  readonly quotaRejections: number
  readonly resetJobsPending: number
  readonly resetJobAgeMs: number
}

export interface SyncServerMetrics {
  readonly authenticationRejected: () => void
  readonly beginHttpRequest: () => () => void
  readonly httpFailed: () => void
  readonly rateLimitRejected: () => void
  readonly peerRecorder: SyncPeerMetricsRecorder
  readonly renderPrometheus: (peer: SyncPeerMetrics) => string
  readonly snapshot: (peer: SyncPeerMetrics) => SyncServerMetricsSnapshot
}

export function createSyncServerMetrics(): SyncServerMetrics {
  let authenticationRejections = 0
  let httpFailures = 0
  let httpRequests = 0
  let httpRequestsInFlight = 0
  let rateLimitRejections = 0
  let relayDeliveries = 0
  let relayDeliveryFailures = 0
  let relayDrops = 0
  let authoritativeCommits = 0
  let authoritativeCommitLatencyMs = 0
  let databaseFailures = 0
  let objectStoreFailures = 0
  let quotaRejections = 0
  let resetJobsPending = 0
  let resetJobAgeMs = 0
  const snapshot = (peer: SyncPeerMetrics): SyncServerMetricsSnapshot => ({
    activeObjectTransfers: peer.activeObjectTransfers,
    activeSyncSessions: peer.activeSyncSessions,
    authenticationRejections,
    httpFailures,
    httpRequests,
    httpRequestsInFlight,
    rateLimitRejections,
    relayDeliveries,
    relayDeliveryFailures,
    relayDrops,
    authoritativeCommits,
    authoritativeCommitLatencyMs,
    databaseFailures,
    objectStoreFailures,
    quotaRejections,
    resetJobsPending,
    resetJobAgeMs,
  })
  return {
    authenticationRejected: () => {
      authenticationRejections += 1
    },
    beginHttpRequest: () => {
      httpRequests += 1
      httpRequestsInFlight += 1
      let ended = false
      return () => {
        if (ended)
          return
        ended = true
        httpRequestsInFlight -= 1
      }
    },
    httpFailed: () => {
      httpFailures += 1
    },
    rateLimitRejected: () => {
      rateLimitRejections += 1
    },
    peerRecorder: {
      authoritativeCommit: (durationMs) => {
        authoritativeCommits += 1
        authoritativeCommitLatencyMs += Math.max(0, durationMs)
      },
      databaseFailure: () => { databaseFailures += 1 },
      objectStoreFailure: () => { objectStoreFailures += 1 },
      quotaRejected: () => { quotaRejections += 1 },
      relayDelivered: () => { relayDeliveries += 1 },
      relayDropped: () => { relayDrops += 1 },
      relayFailed: () => { relayDeliveryFailures += 1 },
      resetJobs: (pending, oldestAgeMs) => {
        resetJobsPending = Math.max(0, pending)
        resetJobAgeMs = Math.max(0, oldestAgeMs)
      },
    },
    renderPrometheus: (peer) => {
      const current = snapshot(peer)
      return [
        '# TYPE memorilo_sync_server_http_requests_total counter',
        `memorilo_sync_server_http_requests_total ${current.httpRequests}`,
        '# TYPE memorilo_sync_server_http_failures_total counter',
        `memorilo_sync_server_http_failures_total ${current.httpFailures}`,
        '# TYPE memorilo_sync_server_http_requests_in_flight gauge',
        `memorilo_sync_server_http_requests_in_flight ${current.httpRequestsInFlight}`,
        '# TYPE memorilo_sync_server_authentication_rejections_total counter',
        `memorilo_sync_server_authentication_rejections_total ${current.authenticationRejections}`,
        '# TYPE memorilo_sync_server_rate_limit_rejections_total counter',
        `memorilo_sync_server_rate_limit_rejections_total ${current.rateLimitRejections}`,
        '# TYPE memorilo_sync_server_active_sync_sessions gauge',
        `memorilo_sync_server_active_sync_sessions ${current.activeSyncSessions}`,
        '# TYPE memorilo_sync_server_active_object_transfers gauge',
        `memorilo_sync_server_active_object_transfers ${current.activeObjectTransfers}`,
        '# TYPE memorilo_sync_server_relay_deliveries_total counter',
        `memorilo_sync_server_relay_deliveries_total ${current.relayDeliveries}`,
        '# TYPE memorilo_sync_server_relay_delivery_failures_total counter',
        `memorilo_sync_server_relay_delivery_failures_total ${current.relayDeliveryFailures}`,
        '# TYPE memorilo_sync_server_relay_drops_total counter',
        `memorilo_sync_server_relay_drops_total ${current.relayDrops}`,
        '# TYPE memorilo_sync_server_authoritative_commits_total counter',
        `memorilo_sync_server_authoritative_commits_total ${current.authoritativeCommits}`,
        '# TYPE memorilo_sync_server_authoritative_commit_latency_ms_total counter',
        `memorilo_sync_server_authoritative_commit_latency_ms_total ${current.authoritativeCommitLatencyMs}`,
        '# TYPE memorilo_sync_server_database_failures_total counter',
        `memorilo_sync_server_database_failures_total ${current.databaseFailures}`,
        '# TYPE memorilo_sync_server_object_store_failures_total counter',
        `memorilo_sync_server_object_store_failures_total ${current.objectStoreFailures}`,
        '# TYPE memorilo_sync_server_quota_rejections_total counter',
        `memorilo_sync_server_quota_rejections_total ${current.quotaRejections}`,
        '# TYPE memorilo_sync_server_reset_jobs_pending gauge',
        `memorilo_sync_server_reset_jobs_pending ${current.resetJobsPending}`,
        '# TYPE memorilo_sync_server_reset_job_age_ms gauge',
        `memorilo_sync_server_reset_job_age_ms ${current.resetJobAgeMs}`,
        '',
      ].join('\n')
    },
    snapshot,
  }
}
