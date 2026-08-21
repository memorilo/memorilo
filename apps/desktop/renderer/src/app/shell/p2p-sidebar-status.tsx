import type { DesktopP2pDeviceStatus, DesktopP2pStatus } from '@memorilo/desktop-api'
import * as stylex from '@stylexjs/stylex'
import { ChevronUp, CircleCheck, Laptop, LoaderCircle, Pause, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { p2pSidebarStatusStyles as styles } from './p2p-sidebar-status.stylex'

type VisibleSyncState = DesktopP2pDeviceStatus['state']

const statePriority: Record<VisibleSyncState, number> = {
  connecting: 2,
  error: 5,
  paused: 4,
  synced: 1,
  syncing: 3,
}

const statusTransition = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.22,
} as const

function visibleDevices(status: DesktopP2pStatus): readonly DesktopP2pDeviceStatus[] {
  const connected = new Set(status.connectedPeers)
  return status.devices.filter(device => device.state !== 'synced' || connected.has(device.peerId))
}

function summaryState(status: DesktopP2pStatus, devices: readonly DesktopP2pDeviceStatus[]): VisibleSyncState | null {
  if (status.state === 'error')
    return 'error'
  let selected: VisibleSyncState | null = null
  for (const device of devices) {
    if (selected === null || statePriority[device.state]! > statePriority[selected]!)
      selected = device.state
  }
  return selected
}

function StatusGlyph({ state }: { state: VisibleSyncState }) {
  if (state === 'error')
    return <TriangleAlert aria-hidden="true" size={16} strokeWidth={1.9} />
  if (state === 'paused')
    return <Pause aria-hidden="true" size={16} strokeWidth={1.9} />
  if (state === 'synced')
    return <CircleCheck aria-hidden="true" size={16} strokeWidth={1.9} />
  return <LoaderCircle aria-hidden="true" {...stylex.props(styles.spinner)} size={16} strokeWidth={1.9} />
}

function statusIconStyle(state: VisibleSyncState) {
  return state === 'error'
    ? styles.iconError
    : state === 'paused'
      ? styles.iconPaused
      : state === 'synced'
        ? styles.iconSynced
        : null
}

function useP2pStatus(): DesktopP2pStatus | null {
  const [status, setStatus] = useState<DesktopP2pStatus | null>(null)

  useEffect(() => {
    if (typeof window.desktop === 'undefined')
      return
    let receivedEvent = false
    let active = true
    const unsubscribe = window.desktop.subscribeP2pStatus((nextStatus) => {
      receivedEvent = true
      setStatus(nextStatus)
    })
    void window.desktop.p2p.getStatus().then((nextStatus) => {
      if (active && !receivedEvent)
        setStatus(nextStatus)
    }).catch(error => console.error('Failed to read P2P sync status', error))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}

export function P2pSidebarStatus() {
  const { t } = useTranslation('app')
  const status = useP2pStatus()
  const shouldReduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const detailId = useId()
  const devices = status === null ? [] : visibleDevices(status)
  const state = status === null ? null : summaryState(status, devices)

  useEffect(() => {
    if (!open)
      return
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target))
        setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const transition = shouldReduceMotion ? { duration: 0 } : statusTransition
  const label = state === null ? '' : t(`p2pSidebarState.${state}`)

  return (
    <AnimatePresence initial={false}>
      {state !== null
        ? (
            <motion.div
              key="p2p-sidebar-status"
              ref={rootRef}
              {...stylex.props(styles.motion)}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: 5 }}
              initial={{ height: 0, opacity: 0, y: 5 }}
              transition={transition}
            >
              <div {...stylex.props(styles.footer)}>
                <button
                  ref={triggerRef}
                  {...stylex.props(styles.trigger)}
                  aria-controls={detailId}
                  aria-expanded={open}
                  type="button"
                  onClick={() => setOpen(current => !current)}
                >
                  <span {...stylex.props(styles.icon, statusIconStyle(state))}>
                    <StatusGlyph state={state} />
                  </span>
                  <span {...stylex.props(styles.summary)} aria-live="polite">
                    <span {...stylex.props(styles.summaryLabel)}>{label}</span>
                    <span {...stylex.props(styles.summaryDetail)}>
                      {devices.length > 0 || (status?.connectedPeers.length ?? 0) > 0
                        ? t('p2pSidebarDeviceCount', { count: Math.max(devices.length, status?.connectedPeers.length ?? 0) })
                        : t('p2pSidebarSync')}
                    </span>
                  </span>
                  <ChevronUp {...stylex.props(styles.disclosure)} aria-hidden="true" size={14} strokeWidth={1.9} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {open && state !== null
                  ? (
                      <motion.section
                        id={detailId}
                        {...stylex.props(styles.popover)}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        aria-label={t('p2pSidebarDetails')}
                        exit={{ opacity: 0, scale: 0.98, y: 4 }}
                        initial={{ opacity: 0, scale: 0.98, y: 4 }}
                        transition={transition}
                      >
                        <h3 {...stylex.props(styles.popoverHeading)}>{t('p2pSidebarDevices')}</h3>
                        {devices.length > 0
                          ? (
                              <div {...stylex.props(styles.deviceList)}>
                                {devices.map(device => (
                                  <div key={device.deviceId} {...stylex.props(styles.deviceRow)}>
                                    <span {...stylex.props(styles.icon, statusIconStyle(device.state))}>
                                      {device.state === 'error'
                                        ? <TriangleAlert aria-hidden="true" size={15} strokeWidth={1.9} />
                                        : <Laptop aria-hidden="true" size={15} strokeWidth={1.8} />}
                                    </span>
                                    <span {...stylex.props(styles.deviceCopy)}>
                                      <span {...stylex.props(styles.deviceName)}>{device.deviceName}</span>
                                      <span {...stylex.props(styles.deviceState)} title={device.error ?? undefined}>
                                        {device.error ?? t(`p2pSidebarState.${device.state}`)}
                                      </span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )
                          : status?.error
                            ? <p {...stylex.props(styles.globalError)}>{status.error}</p>
                            : null}
                      </motion.section>
                    )
                  : null}
              </AnimatePresence>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}
