import type { Scope } from 'effect'
import type { ChildProcess } from 'node:child_process'
import type { Server } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { toError } from '@memorilo/effect-lifecycle'
import { MemoryPairingStore, PairingManager } from '@memorilo/sync/node'
import { expect, test } from '@playwright/test'
import { Duration, Effect, Schedule } from 'effect'

interface RunningServer {
  readonly diagnostics: () => string
  readonly httpUrl: string
  readonly peerPort: number
  readonly port: number
  readonly process: ChildProcess
}

interface ProcessExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}

class ServerExitedBeforeReadiness extends Error {}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const syncServerEntry = resolve(repositoryRoot, 'apps/sync-server/src/index.ts')
const tsxEntry = resolve(repositoryRoot, 'apps/sync-server/node_modules/tsx/dist/cli.mjs')
const ownerPassword = 'correct-horse-battery-staple'

function closeTcpServer(server: Server): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    if (!server.listening) {
      resume(Effect.void)
      return
    }
    server.close(() => resume(Effect.void))
  })
}

function listenTcpServer(port = 0): Effect.Effect<{ readonly port: number, readonly server: Server }, Error, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.callback<{ readonly port: number, readonly server: Server }, Error>((resume) => {
      const server = createServer()
      const onError = (error: Error): void => resume(Effect.fail(error))
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError)
        const address = server.address()
        if (typeof address !== 'object' || address === null) {
          resume(Effect.fail(new Error('Failed to reserve a TCP port')))
          return
        }
        resume(Effect.succeed({ port: address.port, server }))
      })
      return Effect.sync(() => server.close())
    }),
    ({ server }) => closeTcpServer(server),
  )
}

function reservePort(): Effect.Effect<number, Error> {
  return Effect.scoped(listenTcpServer().pipe(Effect.map(({ port }) => port)))
}

function temporaryDirectory(prefix: string): Effect.Effect<string, Error, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.tryPromise({ catch: toError, try: () => mkdtemp(resolve(tmpdir(), prefix)) }),
    path => Effect.tryPromise({ catch: toError, try: () => rm(path, { force: true, recursive: true }) }).pipe(Effect.orDie),
  )
}

function awaitProcessExit(child: ChildProcess): Effect.Effect<ProcessExit> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Effect.succeed({ code: child.exitCode, signal: child.signalCode })
  return Effect.callback<ProcessExit>((resume) => {
    const exited = (code: number | null, signal: NodeJS.Signals | null): void => {
      resume(Effect.succeed({ code, signal }))
    }
    child.once('exit', exited)
    return Effect.sync(() => child.off('exit', exited))
  })
}

function stopProcess(child: ChildProcess): Effect.Effect<ProcessExit> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Effect.succeed({ code: child.exitCode, signal: child.signalCode })
  const exited = awaitProcessExit(child)
  return Effect.sync(() => child.kill('SIGTERM')).pipe(
    Effect.andThen(exited),
    Effect.timeoutOrElse({
      duration: Duration.seconds(5),
      onTimeout: () => Effect.sync(() => child.kill('SIGKILL')).pipe(Effect.andThen(exited)),
    }),
  )
}

function startSyncServer(
  dataDirectory: string,
  registration: 'disabled' | 'invite-only' | 'public',
  ports?: { readonly peerPort: number, readonly port: number },
): Effect.Effect<RunningServer, Error> {
  return Effect.gen(function* () {
    const selectedPorts = ports ?? (yield* Effect.all({ peerPort: reservePort(), port: reservePort() }, { concurrency: 2 }))
    const spawned = yield* spawnSyncServer(dataDirectory, registration, selectedPorts)
    const child = spawned.process
    const httpUrl = `http://127.0.0.1:${selectedPorts.port}`
    const readiness = Effect.tryPromise({
      catch: toError,
      try: async () => {
        if (child.exitCode !== null || child.signalCode !== null)
          throw new ServerExitedBeforeReadiness(`Sync Server exited before readiness: ${spawned.diagnostics()}`)
        const response = await fetch(`${httpUrl}/readyz`)
        if (response.status !== 200)
          throw new Error(`Sync Server readiness returned ${response.status}`)
      },
    }).pipe(
      Effect.retry({
        schedule: Schedule.spaced(Duration.millis(50)),
        while: error => !(error instanceof ServerExitedBeforeReadiness),
      }),
      Effect.timeoutOrElse({
        duration: Duration.seconds(20),
        onTimeout: () => Effect.fail(new Error(`Sync Server did not become ready: ${spawned.diagnostics()}`)),
      }),
      Effect.onError(() => stopProcess(child)),
    )
    yield* readiness
    return {
      diagnostics: spawned.diagnostics,
      httpUrl,
      peerPort: selectedPorts.peerPort,
      port: selectedPorts.port,
      process: child,
    }
  })
}

function spawnSyncServer(
  dataDirectory: string,
  registration: 'disabled' | 'invite-only' | 'public',
  ports: { readonly peerPort: number, readonly port: number },
): Effect.Effect<{ readonly diagnostics: () => string, readonly process: ChildProcess }> {
  return Effect.sync(() => {
    const child = spawn(process.execPath, [tsxEntry, syncServerEntry], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MEMORILO_SYNC_SERVER_DATA_DIR: dataDirectory,
        MEMORILO_SYNC_SERVER_HOST: '127.0.0.1',
        MEMORILO_SYNC_SERVER_PEER_PORT: String(ports.peerPort),
        MEMORILO_SYNC_SERVER_PORT: String(ports.port),
        MEMORILO_SYNC_SERVER_REGISTRATION: registration,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let diagnostics = ''
    child.stdout?.on('data', chunk => diagnostics += String(chunk))
    child.stderr?.on('data', chunk => diagnostics += String(chunk))
    return { diagnostics: () => diagnostics, process: child }
  })
}

function withSyncServer<Result>(
  registration: 'disabled' | 'invite-only' | 'public',
  operation: (server: RunningServer) => Promise<Result>,
): Promise<Result> {
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* temporaryDirectory('memorilo-sync-server-web-e2e-')
    const server = yield* Effect.acquireRelease(
      startSyncServer(directory, registration),
      current => stopProcess(current.process).pipe(Effect.asVoid, Effect.orDie),
    )
    return yield* Effect.tryPromise({ catch: toError, try: () => operation(server) })
  })))
}

async function createOwner(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByLabel('Username').fill('owner')
  await page.getByLabel('Password').fill(ownerPassword)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toContainText('Account created')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('#management-navigation')).toBeAttached()
}

test('the server process exits cleanly on SIGTERM and releases both listeners', async () => {
  await withSyncServer('disabled', async (server) => {
    const exit = await Effect.runPromise(stopProcess(server.process))
    expect(exit, server.diagnostics()).toEqual({ code: 0, signal: null })
    await Effect.runPromise(Effect.all([
      Effect.scoped(listenTcpServer(server.port)).pipe(Effect.asVoid),
      Effect.scoped(listenTcpServer(server.peerPort)).pipe(Effect.asVoid),
    ], { concurrency: 2 }))
  })
})

test('a public-port collision rolls back the internal peer listener', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* temporaryDirectory('memorilo-sync-server-port-collision-')
    const occupied = yield* listenTcpServer()
    const peerPort = yield* reservePort()
    const spawned = yield* Effect.acquireRelease(
      spawnSyncServer(directory, 'disabled', { peerPort, port: occupied.port }),
      current => stopProcess(current.process).pipe(Effect.asVoid, Effect.orDie),
    )
    const exit = yield* awaitProcessExit(spawned.process).pipe(
      Effect.timeoutOrElse({
        duration: Duration.seconds(20),
        onTimeout: () => Effect.fail(new Error(`Sync Server did not reject the occupied port: ${spawned.diagnostics()}`)),
      }),
    )
    expect(exit, spawned.diagnostics()).toEqual({ code: 1, signal: null })
    expect(spawned.diagnostics()).toContain('Memorilo Sync Server failed')
    yield* listenTcpServer(peerPort)
  })))
})

test('mobile management flow keeps every operation reachable', async ({ page }) => {
  await withSyncServer('disabled', async (server) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await createOwner(page, server.httpUrl)

    const menu = page.getByRole('button', { name: /navigation/u })
    await expect(menu).toBeVisible()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Server data' })).toBeVisible()

    await page.getByRole('button', { name: 'Server data' }).click()
    await expect(page.getByText('The server cannot restore it offline; only an authorized client or another peer can repopulate it.')).toBeVisible()
    const clearData = page.getByRole('button', { name: 'Clear server data' })
    await expect(clearData).toBeDisabled()
    await page.getByLabel('Current password').fill(ownerPassword)
    await page.getByLabel('Type CLEAR SERVER DATA to confirm').fill('CLEAR SERVER DATA')
    await expect(clearData).toBeEnabled()
    await clearData.click()
    await expect(page.getByRole('status')).toContainText('cannot be recovered offline from this server')

    await page.getByRole('button', { name: /navigation/u }).click()
    await page.getByRole('button', { name: 'Devices' }).click()
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeFocused()
    await page.getByRole('button', { name: 'Create invitation' }).click()
    const invitation = await page.getByLabel('Invitation').inputValue()
    const clientPairing = new PairingManager({
      deviceId: 'browser-e2e-device',
      deviceName: 'Browser E2E device',
      peerId: 'browser-e2e-peer',
      role: 'device',
    }, new MemoryPairingStore())
    const accepted = await clientPairing.acceptInvitation(invitation)
    await page.getByLabel('Client response').fill(accepted.response)
    await page.getByRole('button', { name: 'Complete pairing' }).click()
    await expect(page.getByLabel('Device credential (copy into the client)')).not.toHaveValue('')
    await expect(page.getByText('Browser E2E device')).toBeVisible()

    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('does not remove data stored on the device')
    await page.getByLabel('Current password to revoke device').fill(ownerPassword)
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0)

    await page.getByRole('button', { name: /navigation/u }).click()
    await page.getByRole('button', { name: 'Sync policy' }).click()
    await page.getByRole('button', { name: 'Authoritative enabled' }).click()
    await page.getByRole('button', { name: 'Retain server data' }).click()
    await page.getByLabel('Current password').fill(ownerPassword)
    await page.getByRole('button', { name: 'Confirm change' }).click()
    await expect(page.getByText('Relay traffic is ephemeral.')).toBeVisible()

    await page.getByRole('button', { name: /navigation/u }).click()
    await expect(page.getByRole('button', { name: 'Server data' })).toHaveCount(0)
  })
})

test('invite-only registration is operable from the management page', async ({ page }) => {
  await withSyncServer('invite-only', async (server) => {
    await createOwner(page, server.httpUrl)
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Create registration invite' }).click()
    const invite = await page.getByLabel('Registration invite').inputValue()
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()

    await page.getByRole('button', { name: 'Create a new account' }).click()
    await page.getByLabel('Username').fill('invited-user')
    await page.getByLabel('Password').fill('another-correct-password')
    await page.getByLabel('Invite token').fill(invite)
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByRole('alert')).toContainText('Account created')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('invited-user')).toBeVisible()
  })
})

test('public registration creates an account without setup or an invite', async ({ page }) => {
  await withSyncServer('public', async (server) => {
    await page.goto(server.httpUrl)
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible()
    await page.getByLabel('Username').fill('public-user')
    await page.getByLabel('Password').fill('public-correct-password')
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByRole('alert')).toContainText('Account created')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('public-user')).toBeVisible()
  })
})
