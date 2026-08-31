import {
  AlertDialog,
  Button,
  Dialog,
  SegmentedControl,
  Status,
  Surface,
  Switch,
  TextField,
  getUiThemeClass,
  getUiThemeCssVariables,
} from '@memorilo/ui'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  Database,
  HardDrive,
  KeyRound,
  Laptop,
  Link,
  LogOut,
  Menu,
  Plus,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type SyncMode = 'authoritative' | 'relay'
type Section = 'account' | 'data' | 'devices' | 'overview' | 'policy'
type Device = {
  id: string
  kind: 'laptop' | 'phone'
  lastSeen: string
  name: string
  online: boolean
  status: 'current' | 'healthy' | 'stale'
}

const variants = [
  { id: 'A', name: 'Operations console' },
  { id: 'B', name: 'Safety queue' },
  { id: 'C', name: 'Peer status board' },
  { id: 'D', name: 'Safety console composite' },
] as const

const initialDevices: Device[] = [
  { id: 'mac', kind: 'laptop', lastSeen: 'This device', name: 'MacBook Pro', online: true, status: 'current' },
  { id: 'pixel', kind: 'phone', lastSeen: '2 minutes ago', name: 'Pixel 10', online: true, status: 'healthy' },
  { id: 'surface', kind: 'laptop', lastSeen: '18 days ago', name: 'Surface Laptop', online: false, status: 'stale' },
]

function applyTheme() {
  const root = document.documentElement
  root.className = getUiThemeClass('neubrutalism', 'light')
  const variables = getUiThemeCssVariables('neubrutalism', 'light')
  for (const [name, value] of Object.entries(variables))
    root.style.setProperty(name, value)
}

function DeviceIcon({ device }: { device: Device }) {
  const Icon = device.kind === 'phone' ? Smartphone : Laptop
  return <Icon aria-hidden="true" size={19} strokeWidth={2.4} />
}

function ModeBadge({ mode }: { mode: SyncMode }) {
  return (
    <span className={`mode-badge mode-badge--${mode}`}>
      {mode === 'relay' ? <Radio size={14} /> : <Database size={14} />}
      {mode === 'relay' ? 'Relay' : 'Authoritative'}
    </span>
  )
}

function RelayNotice() {
  return (
    <div className="relay-notice" role="note">
      <WifiOff aria-hidden="true" size={20} />
      <div>
        <strong>Relay cannot recover data while your devices are offline.</strong>
        <span>The server forwards sync traffic only while another account device is connected. It stores no note, learning, or asset payloads.</span>
      </div>
    </div>
  )
}

function Metric({ label, value, detail }: { detail: string, label: string, value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function DeviceRows({ devices, onRevoke }: { devices: Device[], onRevoke: (device: Device) => void }) {
  return (
    <div className="device-list">
      {devices.map(device => (
        <div className="device-row" key={device.id}>
          <div className="device-symbol"><DeviceIcon device={device} /></div>
          <div className="device-identity">
            <strong>{device.name}</strong>
            <span>{device.online ? 'Online' : `Last seen ${device.lastSeen}`}</span>
          </div>
          <span className={`health health--${device.status}`}>
            {device.status === 'stale' ? 'Review' : device.status === 'current' ? 'Current' : 'Healthy'}
          </span>
          {device.status === 'current'
            ? <span className="current-label">Protected</span>
            : (
                <Button aria-label={`Revoke ${device.name}`} tooltip={`Revoke ${device.name}`} variant="icon" onClick={() => onRevoke(device)}>
                  <Trash2 size={17} />
                </Button>
              )}
        </div>
      ))}
    </div>
  )
}

function DangerZone({ onClear }: { onClear: () => void }) {
  return (
    <div className="danger-zone">
      <div>
        <span className="eyebrow eyebrow--danger">Destructive operation</span>
        <h3>Clear server-held sync data</h3>
        <p>Removes authoritative Notes, Personal Learning Sync, assets, cursors, and snapshots. Your account and device memberships remain.</p>
      </div>
      <Button variant="danger" onClick={onClear}><Trash2 size={17} />Clear server data</Button>
    </div>
  )
}

function PairingPanel({ onApprove }: { onApprove: () => void }) {
  return (
    <div className="pairing-panel">
      <div className="pairing-header">
        <div className="pairing-icon"><Link size={22} /></div>
        <div>
          <span className="eyebrow">Pending device</span>
          <h3>Pair Pixel Tablet?</h3>
        </div>
      </div>
      <dl className="pairing-facts">
        <div><dt>Server</dt><dd>sync.memorilo.example</dd></div>
        <div><dt>Account</dt><dd>mina</dd></div>
        <div><dt>Code</dt><dd className="pairing-code">7K4M-PQ</dd></div>
        <div><dt>Expires</dt><dd>4:32</dd></div>
      </dl>
      <p className="pairing-copy">Confirm that the same account, server domain, and code are visible on the client before approving.</p>
      <div className="button-row">
        <Button variant="primary" onClick={onApprove}><ShieldCheck size={17} />Approve device</Button>
        <Button variant="secondary"><X size={17} />Reject</Button>
      </div>
    </div>
  )
}

type ViewProps = {
  devices: Device[]
  mode: SyncMode
  onAddDevice: () => void
  onClear: () => void
  onModeChange: (mode: SyncMode) => void
  onPair: () => void
  onRegistration: () => void
  onRevoke: (device: Device) => void
}

function VariantA(props: ViewProps) {
  const [section, setSection] = useState<Section>('overview')
  const nav: Array<{ icon: typeof Activity, id: Section, label: string }> = [
    { icon: Activity, id: 'overview', label: 'Overview' },
    { icon: UsersRound, id: 'devices', label: 'Devices' },
    { icon: Radio, id: 'policy', label: 'Sync policy' },
    { icon: HardDrive, id: 'data', label: 'Server data' },
    { icon: UserRound, id: 'account', label: 'Account' },
  ]
  return (
    <div className="variant-a">
      <aside className="a-sidebar">
        <div className="brand"><span className="brand-mark">M</span><div><strong>Memorilo</strong><small>Sync Server</small></div></div>
        <nav aria-label="Management">
          {nav.map(item => (
            <button className={section === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setSection(item.id)}>
              <item.icon size={18} />{item.label}
            </button>
          ))}
        </nav>
        <div className="account-chip"><span>MI</span><div><strong>mina</strong><small>Owner</small></div><LogOut size={16} /></div>
      </aside>
      <main className="a-main">
        <header className="page-header">
          <div><span className="eyebrow">sync.memorilo.example</span><h1>{nav.find(item => item.id === section)?.label}</h1></div>
          <Status variant="success"><Wifi size={15} />Server operational</Status>
        </header>
        {section === 'overview' && (
          <>
            <section className="metric-band" aria-label="Account status">
              <Metric detail="2 online now" label="Authorized devices" value={`${props.devices.length}`} />
              <Metric detail="Notes, learning, assets" label="Stored data" value="2.8 GB" />
              <Metric detail="Completed 46 sec ago" label="Last durable sync" value="Healthy" />
            </section>
            <section className="section-block">
              <div className="section-heading"><div><span className="eyebrow">Account policy</span><h2>Authoritative recovery is active</h2></div><ModeBadge mode={props.mode} /></div>
              <p className="lede">This server keeps a plaintext, durable copy of synchronized data and can restore a device after local data loss.</p>
              <div className="quick-actions">
                <Button variant="primary" onClick={props.onAddDevice}><Plus size={17} />Add device</Button>
                <Button variant="secondary" onClick={() => setSection('policy')}><Radio size={17} />Review sync policy</Button>
              </div>
            </section>
            <section className="section-block section-block--lined">
              <div className="section-heading"><div><span className="eyebrow">Recent peers</span><h2>Device health</h2></div><Button variant="plain" onClick={() => setSection('devices')}>View all <ArrowRight size={16} /></Button></div>
              <DeviceRows devices={props.devices.slice(0, 2)} onRevoke={props.onRevoke} />
            </section>
          </>
        )}
        {section === 'devices' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Membership epoch 14</span><h2>Authorized devices</h2></div><Button variant="primary" onClick={props.onAddDevice}><Plus size={17} />Add device</Button></div><DeviceRows devices={props.devices} onRevoke={props.onRevoke} /><div className="subsection"><PairingPanel onApprove={props.onPair} /></div></section>}
        {section === 'policy' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Recovery contract</span><h2>Choose how this account syncs</h2></div><ModeBadge mode={props.mode} /></div><ModeSelector mode={props.mode} onModeChange={props.onModeChange} /></section>}
        {section === 'data' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Authoritative storage</span><h2>Server-held data</h2></div><span className="storage-total">2.8 GB</span></div><StorageBreakdown /><DangerZone onClear={props.onClear} /></section>}
        {section === 'account' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Account</span><h2>mina</h2></div><Button variant="secondary" onClick={props.onRegistration}><KeyRound size={17} />Preview invite flow</Button></div><div className="account-details"><div><span>Registration</span><strong>Invite-only</strong></div><div><span>Recovery codes</span><strong>8 remaining</strong></div><div><span>Passkey</span><strong>Configured</strong></div></div></section>}
      </main>
    </div>
  )
}

function ModeSelector({ mode, onModeChange }: { mode: SyncMode, onModeChange: (mode: SyncMode) => void }) {
  return (
    <div className="mode-selector">
      <SegmentedControl.Root value={mode} onValueChange={value => onModeChange(value as SyncMode)}>
        <SegmentedControl.Item value="authoritative"><Database size={16} />Authoritative</SegmentedControl.Item>
        <SegmentedControl.Item value="relay"><Radio size={16} />Relay</SegmentedControl.Item>
      </SegmentedControl.Root>
      <div className="mode-comparison">
        <div className={mode === 'authoritative' ? 'selected' : ''}><Check size={18} /><strong>Offline recovery</strong><span>Server durably stores plaintext synchronized data.</span></div>
        <div className={mode === 'relay' ? 'selected' : ''}><Wifi size={18} /><strong>Online forwarding</strong><span>Payload passes only between devices connected at the same time.</span></div>
      </div>
      {mode === 'relay' && <RelayNotice />}
    </div>
  )
}

function StorageBreakdown() {
  return (
    <div className="storage-breakdown">
      <div><span className="storage-swatch storage-swatch--notes" /><strong>Notes</strong><span>824 MB</span></div>
      <div><span className="storage-swatch storage-swatch--learning" /><strong>Learning</strong><span>46 MB</span></div>
      <div><span className="storage-swatch storage-swatch--assets" /><strong>Assets</strong><span>1.9 GB</span></div>
    </div>
  )
}

function VariantB(props: ViewProps) {
  const [task, setTask] = useState<'pair' | 'policy' | 'recovery'>('pair')
  return (
    <div className="variant-b">
      <header className="b-header">
        <div className="brand"><span className="brand-mark">M</span><div><strong>Memorilo Sync</strong><small>sync.memorilo.example</small></div></div>
        <div className="b-header-status"><span className="live-dot" />Operational</div>
        <Button aria-label="Preview account registration" tooltip="Preview account registration" variant="icon" onClick={props.onRegistration}><UserRound size={18} /></Button>
      </header>
      <main className="b-main">
        <section className="b-intro">
          <div><span className="eyebrow">Good morning, Mina</span><h1>Two actions need your attention.</h1><p>Review identity and recovery impact before changing who or what the server trusts.</p></div>
          <ModeBadge mode={props.mode} />
        </section>
        <div className="b-layout">
          <aside className="task-queue" aria-label="Action queue">
            <button className={task === 'pair' ? 'active' : ''} type="button" onClick={() => setTask('pair')}><span className="task-index">01</span><div><strong>Approve a device</strong><small>Expires in 4:32</small></div><ArrowRight size={17} /></button>
            <button className={task === 'policy' ? 'active' : ''} type="button" onClick={() => setTask('policy')}><span className="task-index">02</span><div><strong>Review sync policy</strong><small>{props.mode === 'relay' ? 'Relay active' : 'Authoritative active'}</small></div><ArrowRight size={17} /></button>
            <button className={task === 'recovery' ? 'active' : ''} type="button" onClick={() => setTask('recovery')}><span className="task-index">03</span><div><strong>Recovery & data</strong><small>2.8 GB stored</small></div><ArrowRight size={17} /></button>
            <div className="queue-summary"><ShieldCheck size={22} /><strong>{props.devices.length} trusted devices</strong><span>Membership epoch 14</span></div>
          </aside>
          <section className="task-workspace">
            {task === 'pair' && <><div className="workspace-heading"><span className="eyebrow">Dual confirmation</span><h2>Verify the device in both places</h2><p>The server will not issue a credential until this page and the client confirm the same identities.</p></div><PairingPanel onApprove={props.onPair} /></>}
            {task === 'policy' && <><div className="workspace-heading"><span className="eyebrow">Account policy</span><h2>Recovery behavior</h2><p>Changing mode changes what this server can retain and recover.</p></div><ModeSelector mode={props.mode} onModeChange={props.onModeChange} /></>}
            {task === 'recovery' && <><div className="workspace-heading"><span className="eyebrow">Server data</span><h2>Recovery source</h2><p>Authoritative content is stored in plaintext and encrypted by your infrastructure at rest.</p></div><StorageBreakdown /><DangerZone onClear={props.onClear} /></>}
          </section>
        </div>
        <section className="trusted-strip">
          <div className="section-heading"><div><span className="eyebrow">Trusted peers</span><h2>Account devices</h2></div><Button variant="secondary" onClick={props.onAddDevice}><Plus size={17} />Add another</Button></div>
          <DeviceRows devices={props.devices} onRevoke={props.onRevoke} />
        </section>
      </main>
    </div>
  )
}

function VariantC(props: ViewProps) {
  const online = props.devices.filter(device => device.online).length
  return (
    <div className="variant-c">
      <header className="c-header">
        <div className="brand"><span className="brand-mark">M</span><div><strong>Memorilo</strong><small>Peer control</small></div></div>
        <div className="c-summary"><span><Server size={15} />sync.memorilo.example</span><span><Wifi size={15} />{online} devices online</span><ModeBadge mode={props.mode} /></div>
        <Button aria-label="Preview account registration" tooltip="Preview account registration" variant="icon" onClick={props.onRegistration}><Menu size={19} /></Button>
      </header>
      <main className="c-main">
        <section className="peer-stage">
          <div className="peer-stage-heading"><div><span className="eyebrow">Live topology</span><h1>Your sync peers</h1></div><Button variant="primary" onClick={props.onAddDevice}><Plus size={17} />Pair device</Button></div>
          <div className="peer-map">
            <div className="server-node"><Cloud size={26} /><strong>Sync Server</strong><ModeBadge mode={props.mode} /><small>2.8 GB durable</small></div>
            <div className="connection-line" />
            <div className="peer-nodes">
              {props.devices.map(device => <div className={`peer-node ${device.online ? 'online' : 'offline'}`} key={device.id}><div><DeviceIcon device={device} /></div><strong>{device.name}</strong><span>{device.online ? 'Connected' : device.lastSeen}</span>{device.status !== 'current' && <Button aria-label={`Revoke ${device.name}`} tooltip={`Revoke ${device.name}`} variant="icon" onClick={() => props.onRevoke(device)}><Trash2 size={15} /></Button>}</div>)}
            </div>
          </div>
        </section>
        <div className="c-grid">
          <section className="c-policy">
            <div className="section-heading"><div><span className="eyebrow">Sync policy</span><h2>Recovery contract</h2></div><Switch aria-label="Authoritative mode" checked={props.mode === 'authoritative'} onCheckedChange={checked => props.onModeChange(checked ? 'authoritative' : 'relay')} /></div>
            <p>{props.mode === 'authoritative' ? 'Server commits plaintext data before acknowledging each sync batch.' : 'Server forwards only while another device is connected.'}</p>
            {props.mode === 'relay' && <RelayNotice />}
          </section>
          <section className="c-events">
            <div className="section-heading"><div><span className="eyebrow">Event stream</span><h2>Recent activity</h2></div><RefreshCw size={18} /></div>
            <ol className="event-list">
              <li><span className="event-dot event-dot--success" /><div><strong>Authoritative batch committed</strong><small>Pixel 10 · 46 seconds ago</small></div></li>
              <li><span className="event-dot" /><div><strong>Pairing request opened</strong><small>Pixel Tablet · 1 minute ago</small></div></li>
              <li><span className="event-dot event-dot--warn" /><div><strong>Stale device needs review</strong><small>Surface Laptop · 18 days offline</small></div></li>
            </ol>
          </section>
        </div>
        <section className="c-bottom">
          <div><span className="eyebrow">Recovery inventory</span><h2>2.8 GB stored across three namespaces</h2><StorageBreakdown /></div>
          <DangerZone onClear={props.onClear} />
        </section>
      </main>
    </div>
  )
}

function VariantD(props: ViewProps) {
  const [section, setSection] = useState<'attention' | 'devices' | 'policy' | 'data'>('attention')
  const [task, setTask] = useState<'pair' | 'policy' | 'recovery'>('pair')
  const online = props.devices.filter(device => device.online).length
  const nav = [
    { id: 'attention' as const, icon: CircleAlert, label: 'Attention' },
    { id: 'devices' as const, icon: UsersRound, label: 'Devices' },
    { id: 'policy' as const, icon: Radio, label: 'Sync policy' },
    { id: 'data' as const, icon: HardDrive, label: 'Server data' },
  ]
  return (
    <div className="variant-d">
      <aside className="d-sidebar">
        <div className="brand"><span className="brand-mark">M</span><div><strong>Memorilo</strong><small>Sync Server</small></div></div>
        <nav aria-label="Management">
          {nav.map(item => <button className={section === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setSection(item.id)}><item.icon size={17} />{item.label}{item.id === 'attention' && <span className="nav-count">2</span>}</button>)}
        </nav>
        <div className="d-sidebar-footer"><span className="live-dot" />Operational<div><strong>mina</strong><small>Owner</small></div></div>
      </aside>
      <main className="d-main">
        <header className="d-header">
          <div><span className="eyebrow">sync.memorilo.example</span><h1>Two actions need your attention.</h1></div>
          <div className="d-header-meta"><span><Wifi size={15} />{online} online</span><ModeBadge mode={props.mode} /><Button aria-label="Preview account registration" tooltip="Preview account registration" variant="icon" onClick={props.onRegistration}><UserRound size={18} /></Button></div>
        </header>
        {section === 'attention' && (
          <>
            <section className="d-peer-strip">
              <div className="d-server-mini"><Cloud size={20} /><div><strong>Sync Server</strong><small>Authoritative · 2.8 GB</small></div></div>
              <div className="d-peer-line" />
              <div className="d-peer-chips">{props.devices.map(device => <div className={`d-peer-chip ${device.online ? '' : 'offline'}`} key={device.id}><DeviceIcon device={device} /><span>{device.name}</span><small>{device.online ? 'Connected' : 'Offline'}</small></div>)}</div>
              <Button variant="secondary" onClick={props.onAddDevice}><Plus size={16} />Pair</Button>
            </section>
            <section className="d-attention-layout">
              <aside className="task-queue" aria-label="Action queue">
                <div className="queue-label"><span className="eyebrow">Safety queue</span><strong>Review before changing trust</strong></div>
                <button className={task === 'pair' ? 'active' : ''} type="button" onClick={() => setTask('pair')}><span className="task-index">01</span><div><strong>Approve a device</strong><small>Expires in 4:32</small></div><ArrowRight size={17} /></button>
                <button className={task === 'policy' ? 'active' : ''} type="button" onClick={() => setTask('policy')}><span className="task-index">02</span><div><strong>Review sync policy</strong><small>{props.mode === 'relay' ? 'Relay active' : 'Authoritative active'}</small></div><ArrowRight size={17} /></button>
                <button className={task === 'recovery' ? 'active' : ''} type="button" onClick={() => setTask('recovery')}><span className="task-index">03</span><div><strong>Recovery & data</strong><small>2.8 GB stored</small></div><ArrowRight size={17} /></button>
                <div className="queue-summary"><ShieldCheck size={19} /><strong>{props.devices.length} trusted devices</strong><span>Membership epoch 14</span></div>
              </aside>
              <section className="task-workspace">
                {task === 'pair' && <><div className="workspace-heading"><span className="eyebrow">Dual confirmation</span><h2>Verify the device in both places</h2><p>The server will not issue a credential until this page and the client confirm the same identities.</p></div><PairingPanel onApprove={props.onPair} /></>}
                {task === 'policy' && <><div className="workspace-heading"><span className="eyebrow">Account policy</span><h2>Recovery behavior</h2><p>Changing mode changes what this server can retain and recover.</p></div><ModeSelector mode={props.mode} onModeChange={props.onModeChange} /></>}
                {task === 'recovery' && <><div className="workspace-heading"><span className="eyebrow">Server data</span><h2>Recovery source</h2><p>Authoritative content is stored in plaintext and encrypted by your infrastructure at rest.</p></div><StorageBreakdown /><DangerZone onClear={props.onClear} /></>}
              </section>
            </section>
          </>
        )}
        {section === 'devices' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Membership epoch 14</span><h2>Authorized devices</h2></div><Button variant="primary" onClick={props.onAddDevice}><Plus size={17} />Pair device</Button></div><DeviceRows devices={props.devices} onRevoke={props.onRevoke} /></section>}
        {section === 'policy' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Account policy</span><h2>Recovery contract</h2></div><ModeBadge mode={props.mode} /></div><ModeSelector mode={props.mode} onModeChange={props.onModeChange} /></section>}
        {section === 'data' && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Authoritative storage</span><h2>Server-held data</h2></div><span className="storage-total">2.8 GB</span></div><StorageBreakdown /><DangerZone onClear={props.onClear} /></section>}
      </main>
    </div>
  )
}

function ConfirmationDialogs({
  clearOpen,
  device,
  mode,
  onClearClose,
  onClearConfirm,
  onRevokeClose,
  onRevokeConfirm,
  onModeClose,
  onModeConfirm,
}: {
  clearOpen: boolean
  device: Device | null
  mode: SyncMode | null
  onClearClose: () => void
  onClearConfirm: () => void
  onRevokeClose: () => void
  onRevokeConfirm: () => void
  onModeClose: () => void
  onModeConfirm: (dataAction: 'clear' | 'keep') => void
}) {
  const [phrase, setPhrase] = useState('')
  const [dataAction, setDataAction] = useState<'clear' | 'keep'>('keep')
  useEffect(() => {
    if (!clearOpen)
      setPhrase('')
  }, [clearOpen])
  return (
    <>
      <AlertDialog.Root open={device !== null} onOpenChange={open => !open && onRevokeClose()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay>
            <AlertDialog.Content variant="alert">
              <AlertDialog.Header><AlertDialog.Title>Revoke {device?.name}?</AlertDialog.Title><AlertDialog.Description>This immediately rejects new sync sessions and stops the device at the next batch boundary.</AlertDialog.Description></AlertDialog.Header>
              <AlertDialog.Body><div className="dialog-warning"><CircleAlert size={20} /><span>Local data on that device is not erased. Re-pairing will require a new credential.</span></div></AlertDialog.Body>
              <AlertDialog.Footer><AlertDialog.Cancel asChild><Button variant="secondary">Cancel</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="danger" onClick={onRevokeConfirm}>Revoke device</Button></AlertDialog.Action></AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Overlay>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={clearOpen} onOpenChange={open => !open && onClearClose()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay>
            <AlertDialog.Content variant="alert">
              <AlertDialog.Header><AlertDialog.Title>Clear all server-held sync data?</AlertDialog.Title><AlertDialog.Description>This advances the account generation and permanently removes authoritative Notes, Personal Learning Sync, assets, cursors, and snapshots from the live server.</AlertDialog.Description></AlertDialog.Header>
              <AlertDialog.Body>
                <div className="irreversible"><WifiOff size={22} /><strong>The server cannot recover this data offline after clearing it.</strong><span>Only an authorized device or another peer that still has the data can repopulate the server.</span></div>
                <label className="confirm-label" htmlFor="confirm-clear">Type <strong>CLEAR SERVER DATA</strong> to continue</label>
                <TextField autoComplete="off" id="confirm-clear" value={phrase} onChange={event => setPhrase(event.target.value)} />
              </AlertDialog.Body>
              <AlertDialog.Footer><AlertDialog.Cancel asChild><Button variant="secondary">Cancel</Button></AlertDialog.Cancel><Button disabled={phrase !== 'CLEAR SERVER DATA'} variant="danger" onClick={onClearConfirm}>Clear permanently</Button></AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Overlay>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={mode !== null} onOpenChange={open => !open && onModeClose()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay>
            <AlertDialog.Content variant="alert">
              <AlertDialog.Header><AlertDialog.Title>Switch to {mode === 'relay' ? 'Relay' : 'Authoritative'} Sync Mode?</AlertDialog.Title><AlertDialog.Description>{mode === 'relay' ? 'The server will stop persisting new sync payloads and will no longer provide offline recovery.' : 'The server will begin storing plaintext synchronized data as a durable recovery peer.'}</AlertDialog.Description></AlertDialog.Header>
              <AlertDialog.Body>
                {mode === 'relay'
                  ? <><RelayNotice /><span className="confirm-label">Existing authoritative data</span><SegmentedControl.Root value={dataAction} onValueChange={value => setDataAction(value as 'clear' | 'keep')}><SegmentedControl.Item value="keep">Keep stored data</SegmentedControl.Item><SegmentedControl.Item value="clear">Clear after switch</SegmentedControl.Item></SegmentedControl.Root></>
                  : <div className="dialog-warning"><Database size={20} /><span>A new sync generation will bootstrap from an authorized device before recovery becomes available.</span></div>}
              </AlertDialog.Body>
              <AlertDialog.Footer><AlertDialog.Cancel asChild><Button variant="secondary">Cancel</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="primary" onClick={() => onModeConfirm(dataAction)}>Confirm switch</Button></AlertDialog.Action></AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Overlay>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}

function RegistrationDialog({ open, onClose, onCreate }: { onClose: () => void, onCreate: () => void, open: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay>
          <Dialog.Content id="registration-preview" variant="wide">
            <Dialog.Header><div><span className="eyebrow">Invitation accepted</span><Dialog.Title>Create your Sync Server account</Dialog.Title><Dialog.Description>sync.memorilo.example · Invite expires in 23 hours</Dialog.Description></div><Dialog.Close aria-label="Close"><X size={16} /></Dialog.Close></Dialog.Header>
            <Dialog.Body>
              <form className="registration-form" id="registration-form" onSubmit={(event) => { event.preventDefault(); onCreate() }}>
                <div className="registration-note"><ShieldCheck size={20} /><div><strong>No email address is required.</strong><span>Your password, recovery codes, and optional passkey protect this server account.</span></div></div>
                <label className="field-label" htmlFor="registration-name">Display name</label><TextField id="registration-name" defaultValue="Mina" />
                <label className="field-label" htmlFor="registration-password">Password</label><TextField autoComplete="new-password" id="registration-password" placeholder="At least 12 characters" type="password" />
                <label className="field-label" htmlFor="registration-confirm">Confirm password</label><TextField autoComplete="new-password" id="registration-confirm" type="password" />
                <label className="check-row"><input type="checkbox" /> <span>Set up a passkey after account creation</span></label>
              </form>
            </Dialog.Body>
            <Dialog.Footer><Dialog.Close asChild><Button variant="secondary">Cancel</Button></Dialog.Close><Button form="registration-form" type="submit" variant="primary"><UserRound size={17} />Create account</Button></Dialog.Footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PrototypeSwitcher({ current }: { current: string }) {
  const currentIndex = Math.max(0, variants.findIndex(variant => variant.id === current))
  const navigate = (offset: number) => {
    const next = variants[(currentIndex + offset + variants.length) % variants.length]
    if (!next)
      return
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next.id)
    window.history.replaceState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable))
        return
      if (event.key === 'ArrowLeft')
        navigate(-1)
      else if (event.key === 'ArrowRight')
        navigate(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })
  const selected = variants[currentIndex] ?? variants[0]
  return (
    <div className="prototype-switcher">
      <button aria-label="Previous variant" type="button" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
      <div><span>Throwaway prototype</span><strong>{selected.id} · {selected.name}</strong></div>
      <button aria-label="Next variant" type="button" onClick={() => navigate(1)}><ArrowRight size={18} /></button>
    </div>
  )
}

function App() {
  const [variant, setVariant] = useState(() => new URLSearchParams(window.location.search).get('variant') ?? 'A')
  const [mode, setMode] = useState<SyncMode>('authoritative')
  const [devices, setDevices] = useState(initialDevices)
  const [revokeDevice, setRevokeDevice] = useState<Device | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState<SyncMode | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setVariant(new URLSearchParams(window.location.search).get('variant') ?? 'A')
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  useEffect(() => {
    if (!toast)
      return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])
  const props = useMemo<ViewProps>(() => ({
    devices,
    mode,
    onAddDevice: () => setToast('Pairing challenge created · expires in 5 minutes'),
    onClear: () => setClearOpen(true),
    onModeChange: next => next !== mode && setPendingMode(next),
    onPair: () => setToast('Pixel Tablet approved · waiting for client confirmation'),
    onRegistration: () => setRegistrationOpen(true),
    onRevoke: setRevokeDevice,
  }), [devices, mode])
  return (
    <>
      {variant === 'B' ? <VariantB {...props} /> : variant === 'C' ? <VariantC {...props} /> : variant === 'D' ? <VariantD {...props} /> : <VariantA {...props} />}
      {!import.meta.env.PROD && <PrototypeSwitcher current={variant} />}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
      <ConfirmationDialogs
        clearOpen={clearOpen}
        device={revokeDevice}
        mode={pendingMode}
        onClearClose={() => setClearOpen(false)}
        onClearConfirm={() => { setClearOpen(false); setToast('Deletion job queued · writes are temporarily paused') }}
        onRevokeClose={() => setRevokeDevice(null)}
        onRevokeConfirm={() => {
          if (revokeDevice)
            setDevices(current => current.filter(device => device.id !== revokeDevice.id))
          setRevokeDevice(null)
          setToast('Device revoked · membership epoch advanced')
        }}
        onModeClose={() => setPendingMode(null)}
        onModeConfirm={(dataAction) => {
          if (pendingMode)
            setMode(pendingMode)
          setPendingMode(null)
          setToast(dataAction === 'clear' ? 'Mode switched · authoritative deletion job queued' : 'Sync mode updated')
        }}
      />
      <RegistrationDialog open={registrationOpen} onClose={() => setRegistrationOpen(false)} onCreate={() => { setRegistrationOpen(false); setToast('Account created · save your recovery codes next') }} />
    </>
  )
}

applyTheme()
const root = document.getElementById('root')
if (!root)
  throw new Error('Prototype root is missing')
createRoot(root).render(<App />)
