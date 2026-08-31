import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { objectKeyFor } from '@memorilo/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresSyncDatabase } from '../infrastructure/database/postgres'
import { createSqliteSyncDatabase } from '../infrastructure/database/sqlite'
import { createFilesystemObjectStore } from '../infrastructure/object-store/filesystem'
import { createS3ObjectStore } from '../infrastructure/object-store/s3'
import { verifyStorageConformance } from './storage-conformance'

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`${name} is required by the storage service lane`)
  return value
}

const postgresUrl = requiredEnvironment('MEMORILO_TEST_POSTGRES_URL')
const toxiproxyApi = requiredEnvironment('MEMORILO_TEST_TOXIPROXY_API')
const s3Options = {
  accessKeyId: requiredEnvironment('MEMORILO_TEST_S3_ACCESS_KEY_ID'),
  bucket: requiredEnvironment('MEMORILO_TEST_S3_BUCKET'),
  endpoint: requiredEnvironment('MEMORILO_TEST_S3_ENDPOINT'),
  forcePathStyle: true,
  region: 'us-east-1',
  secretAccessKey: requiredEnvironment('MEMORILO_TEST_S3_SECRET_ACCESS_KEY'),
}

async function setProxyEnabled(name: 'postgres' | 's3', enabled: boolean): Promise<void> {
  const response = await fetch(`${toxiproxyApi}/proxies/${name}`, {
    body: JSON.stringify({ enabled }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!response.ok)
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} Toxiproxy proxy ${name}: ${response.status} ${await response.text()}`)
}

describe('production storage adapter matrix', () => {
  const directories: string[] = []

  beforeAll(async () => {
    const client = new S3Client({
      endpoint: s3Options.endpoint,
      forcePathStyle: true,
      region: s3Options.region,
      credentials: { accessKeyId: s3Options.accessKeyId, secretAccessKey: s3Options.secretAccessKey },
    })
    try {
      await client.send(new CreateBucketCommand({ Bucket: s3Options.bucket }))
    }
    finally {
      client.destroy()
    }
  })

  afterAll(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('conforms with SQLite and S3-compatible objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-storage-sqlite-s3-'))
    directories.push(directory)
    await verifyStorageConformance({
      createDatabase: () => createSqliteSyncDatabase({ filename: join(directory, 'sync.sqlite') }),
      createObjectStore: () => createS3ObjectStore(s3Options),
    })
  })

  it('conforms with PostgreSQL and filesystem objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-storage-postgres-filesystem-'))
    directories.push(directory)
    await verifyStorageConformance({
      createDatabase: () => createPostgresSyncDatabase({ url: postgresUrl }),
      createObjectStore: () => createFilesystemObjectStore({ root: join(directory, 'objects') }),
    })
  })

  it('conforms with PostgreSQL and S3-compatible objects', async () => {
    await verifyStorageConformance({
      createDatabase: () => createPostgresSyncDatabase({ url: postgresUrl }),
      createObjectStore: () => createS3ObjectStore(s3Options),
    })
  })

  it('rejects PostgreSQL work during a network cut and recovers durable state after reconnect', async () => {
    const accountId = `toxiproxy-postgres-${randomUUID()}`
    const interruptedAccountId = `toxiproxy-postgres-interrupted-${randomUUID()}`
    const database = createPostgresSyncDatabase({
      connectTimeoutSeconds: 1,
      maximumConnections: 1,
      url: postgresUrl,
    })
    await database.migrate()
    await database.repository.createAccount({ accountId, enabledModes: ['authoritative'] })
    await database.close()

    await setProxyEnabled('postgres', false)
    const disconnected = createPostgresSyncDatabase({
      connectTimeoutSeconds: 1,
      maximumConnections: 1,
      url: postgresUrl,
    })
    try {
      await expect(disconnected.repository.createAccount({
        accountId: interruptedAccountId,
        enabledModes: ['authoritative'],
      })).rejects.toThrow()
    }
    finally {
      await disconnected.close().catch(() => undefined)
      await setProxyEnabled('postgres', true)
    }

    const recovered = createPostgresSyncDatabase({
      connectTimeoutSeconds: 1,
      maximumConnections: 1,
      url: postgresUrl,
    })
    try {
      await expect(recovered.repository.getAccountState(accountId)).resolves.toMatchObject({ accountId })
      await expect(recovered.repository.getAccountState(interruptedAccountId)).resolves.toBeNull()
    }
    finally {
      await recovered.close()
    }
  })

  it('rejects S3 work during a network cut and recovers immutable objects after reconnect', async () => {
    const identity = randomUUID()
    const accountId = `toxiproxy-s3-${identity}`
    const body = new TextEncoder().encode(`toxiproxy-object-${identity}`)
    const contentHash = createHash('sha256').update(body).digest('hex')
    const metadata = {
      accountId,
      contentHash,
      contentLength: body.byteLength,
      contentType: 'text/plain',
      createdAt: Date.now(),
      generation: 0,
      key: objectKeyFor(accountId, 0, contentHash),
      namespace: 'assets' as const,
    }
    const interruptedBody = new TextEncoder().encode(`toxiproxy-interrupted-${identity}`)
    const interruptedHash = createHash('sha256').update(interruptedBody).digest('hex')
    const interruptedMetadata = {
      ...metadata,
      contentHash: interruptedHash,
      contentLength: interruptedBody.byteLength,
      key: objectKeyFor(accountId, 0, interruptedHash),
    }
    const initial = createS3ObjectStore({ ...s3Options, maxAttempts: 1 })
    try {
      await initial.putImmutable(metadata, (async function* () {
        yield body
      })())
    }
    finally {
      await initial.close()
    }

    await setProxyEnabled('s3', false)
    const disconnected = createS3ObjectStore({ ...s3Options, maxAttempts: 1 })
    try {
      await expect(disconnected.putImmutable(interruptedMetadata, (async function* () {
        yield interruptedBody
      })())).rejects.toThrow()
    }
    finally {
      await disconnected.close()
      await setProxyEnabled('s3', true)
    }

    const recovered = createS3ObjectStore({ ...s3Options, maxAttempts: 1 })
    try {
      await expect(recovered.head(accountId, metadata.key)).resolves.toMatchObject(metadata)
      await expect(recovered.head(accountId, interruptedMetadata.key)).resolves.toBeNull()
    }
    finally {
      await recovered.close()
    }
  })
})
