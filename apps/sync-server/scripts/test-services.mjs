import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { Duration, Effect, Fiber, Schedule } from 'effect'

const root = resolve(import.meta.dirname, '../../..')
let stopping = false
let programFiber
let signalExitCode

class ServiceProcessError extends Error {}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: options.stdio ?? 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0)
        resolveRun()
      else
        reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

function startService(name, command, args, env = process.env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.startError = null
  child.stdout.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))
  child.once('error', (error) => {
    child.startError = error
    process.stderr.write(`[${name}] failed to start: ${error.message}\n`)
  })
  child.once('exit', (code, signal) => {
    if (!stopping)
      process.stderr.write(`[${name}] exited unexpectedly with ${code ?? signal}\n`)
  })
  return child
}

function stopService(child) {
  return new Promise((resolveStop) => {
    let finished = false
    let timeout
    const finish = () => {
      if (finished)
        return
      finished = true
      clearTimeout(timeout)
      child.removeListener('exit', finish)
      resolveStop()
    }
    timeout = setTimeout(() => {
      if (!child.kill('SIGKILL'))
        finish()
    }, 5_000)
    child.once('exit', finish)
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      finish()
      return
    }
    if (!child.kill('SIGTERM') && (child.exitCode !== null || child.signalCode !== null))
      finish()
  })
}

function serviceResource(name, command, args, env = process.env) {
  return Effect.acquireRelease(
    Effect.sync(() => startService(name, command, args, env)),
    child => Effect.sync(() => {
      stopping = true
    }).pipe(Effect.andThen(Effect.promise(() => stopService(child)))),
  )
}

function assertServiceRunning(name, child) {
  if (child.startError)
    throw new ServiceProcessError(`${name} failed to start`, { cause: child.startError })
  if (child.exitCode !== null || child.signalCode !== null)
    throw new ServiceProcessError(`${name} exited before becoming ready with ${child.exitCode ?? child.signalCode}`)
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) {
        server.close()
        reject(new Error('Failed to allocate a service port'))
        return
      }
      const { port } = address
      server.close(error => error ? reject(error) : resolvePort(port))
    })
  })
}

function waitUntil(name, probe, timeoutMs = 15_000) {
  let lastError
  const retrySchedule = Schedule.spaced(Duration.millis(100)).pipe(
    Schedule.while(({ input }) => !(input instanceof ServiceProcessError)),
  )
  return Effect.tryPromise({
    catch: error => error instanceof Error ? error : new Error(String(error)),
    try: probe,
  }).pipe(
    Effect.flatMap(ready => ready
      ? Effect.void
      : Effect.fail(new Error(`${name} is not ready`))),
    Effect.tapError(error => Effect.sync(() => {
      lastError = error
    })),
    Effect.retry(retrySchedule),
    Effect.timeoutOrElse({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => Effect.fail(new Error(`${name} did not become ready`, { cause: lastError })),
    }),
  )
}

async function createProxy(apiPort, name, listenPort, upstreamPort) {
  const response = await fetch(`http://127.0.0.1:${apiPort}/proxies`, {
    body: JSON.stringify({
      enabled: true,
      listen: `127.0.0.1:${listenPort}`,
      name,
      upstream: `127.0.0.1:${upstreamPort}`,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`Failed to create Toxiproxy proxy ${name}: ${response.status} ${await response.text()}`)
}

function stopOnSignal(signal) {
  if (signalExitCode !== undefined)
    return
  signalExitCode = signal === 'SIGINT' ? 130 : 143
  stopping = true
  if (!programFiber)
    return
  void Effect.runPromise(Fiber.interrupt(programFiber))
    .then(() => process.exit(signalExitCode))
    .catch((error) => {
      process.stderr.write(`Failed to stop test services after ${signal}: ${error instanceof Error ? error.stack : String(error)}\n`)
      process.exit(1)
    })
}

process.once('SIGINT', () => stopOnSignal('SIGINT'))
process.once('SIGTERM', () => stopOnSignal('SIGTERM'))

const program = Effect.scoped(Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.tryPromise({
      catch: error => error instanceof Error ? error : new Error(String(error)),
      try: () => mkdtemp(join(tmpdir(), 'memorilo-sync-services-')),
    }),
    path => Effect.promise(() => rm(path, { force: true, recursive: true })),
  )
  const [
    postgresPort,
    s3Port,
    s3GrpcPort,
    masterPort,
    masterGrpcPort,
    volumePort,
    volumeGrpcPort,
    filerPort,
    filerGrpcPort,
    toxiproxyApiPort,
    postgresProxyPort,
    s3ProxyPort,
  ] = yield* Effect.all([
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
    Effect.tryPromise({ try: freePort }),
  ], { concurrency: 'unbounded' })
  const postgresData = join(directory, 'postgres')
  const s3Data = join(directory, 's3')
  yield* Effect.tryPromise({ try: () => mkdir(s3Data, { recursive: true }) })
  yield* Effect.tryPromise({
    catch: error => error instanceof Error ? error : new Error(String(error)),
    try: () => run('initdb', ['-D', postgresData, '-A', 'trust', '-U', 'postgres', '--encoding=UTF8', '--no-locale']),
  })
  const postgres = yield* serviceResource('postgres', 'postgres', ['-D', postgresData, '-h', '127.0.0.1', '-p', String(postgresPort)])
  yield* waitUntil('PostgreSQL', async () => {
    assertServiceRunning('PostgreSQL', postgres)
    try {
      await run('pg_isready', ['-h', '127.0.0.1', '-p', String(postgresPort)], { stdio: 'ignore' })
      return true
    }
    catch {
      return false
    }
  })

  const s3 = yield* serviceResource('s3', 'weed', [
    'server',
    `-dir=${s3Data}`,
    '-ip=127.0.0.1',
    '-ip.bind=127.0.0.1',
    `-master.port=${masterPort}`,
    `-master.port.grpc=${masterGrpcPort}`,
    '-master.telemetry=false',
    `-volume.port=${volumePort}`,
    `-volume.port.grpc=${volumeGrpcPort}`,
    '-volume.max=1',
    '-filer',
    `-filer.port=${filerPort}`,
    `-filer.port.grpc=${filerGrpcPort}`,
    '-s3',
    `-s3.port=${s3Port}`,
    `-s3.port.grpc=${s3GrpcPort}`,
    '-s3.port.iceberg=0',
  ])
  yield* waitUntil('S3 gateway', async () => {
    assertServiceRunning('S3 gateway', s3)
    const response = await fetch(`http://127.0.0.1:${s3Port}`)
    return response.status < 500
  })

  const toxiproxy = yield* serviceResource('toxiproxy', 'toxiproxy-server', ['-host', '127.0.0.1', '-port', String(toxiproxyApiPort)])
  yield* waitUntil('Toxiproxy', async () => {
    assertServiceRunning('Toxiproxy', toxiproxy)
    return (await fetch(`http://127.0.0.1:${toxiproxyApiPort}/proxies`)).ok
  })
  yield* Effect.tryPromise({ try: () => createProxy(toxiproxyApiPort, 'postgres', postgresProxyPort, postgresPort) })
  yield* Effect.tryPromise({ try: () => createProxy(toxiproxyApiPort, 's3', s3ProxyPort, s3Port) })

  yield* Effect.tryPromise({
    catch: error => error instanceof Error ? error : new Error(String(error)),
    try: () => run(join(root, 'node_modules/.bin/vitest'), ['run', '--config', 'vitest.services.config.ts'], {
      cwd: join(root, 'apps/sync-server'),
      env: {
        ...process.env,
        MEMORILO_TEST_POSTGRES_URL: `postgres://postgres@127.0.0.1:${postgresProxyPort}/postgres`,
        MEMORILO_TEST_S3_ACCESS_KEY_ID: 'memorilo-test',
        MEMORILO_TEST_S3_BUCKET: 'memorilo-sync-tests',
        MEMORILO_TEST_S3_ENDPOINT: `http://127.0.0.1:${s3ProxyPort}`,
        MEMORILO_TEST_S3_SECRET_ACCESS_KEY: 'memorilo-s3-test-secret',
        MEMORILO_TEST_TOXIPROXY_API: `http://127.0.0.1:${toxiproxyApiPort}`,
      },
    }),
  })
}))

programFiber = Effect.runFork(program)
try {
  await Effect.runPromise(Fiber.join(programFiber))
}
finally {
  // Mark normal scope finalization before child exit events arrive; otherwise
  // a clean SIGTERM from an Effect finalizer is reported as an infrastructure failure.
  stopping = true
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
}
