import type { SyncObjectMetadata, SyncObjectStore } from '@memorilo/sync'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { assertMetadata, ensureAccountKey, sameMetadata } from './metadata'

export interface S3ObjectStoreOptions {
  readonly bucket: string
  readonly region: string
  readonly endpoint?: string
  readonly forcePathStyle?: boolean
  readonly accessKeyId?: string
  readonly secretAccessKey?: string
  readonly maxAttempts?: number
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error))
    return undefined
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
}

function isMissing(error: unknown): boolean {
  return statusCode(error) === 404
}

function isPreconditionFailure(error: unknown): boolean {
  return statusCode(error) === 412
}

function metadataHeaders(metadata: SyncObjectMetadata): Record<string, string> {
  return {
    'memorilo-account': metadata.accountId,
    'memorilo-created-at': String(metadata.createdAt),
    'memorilo-generation': String(metadata.generation),
    'memorilo-sha256': metadata.contentHash,
  }
}

function metadataFromHead(
  accountId: string,
  key: string,
  head: { ContentLength?: number, ContentType?: string, Metadata?: Record<string, string> },
): SyncObjectMetadata {
  const metadata = head.Metadata ?? {}
  const generation = Number(metadata['memorilo-generation'])
  const createdAt = Number(metadata['memorilo-created-at'])
  const contentHash = metadata['memorilo-sha256']
  if (metadata['memorilo-account'] !== accountId
    || typeof contentHash !== 'string'
    || !Number.isSafeInteger(generation)
    || !Number.isSafeInteger(createdAt)
    || !Number.isSafeInteger(head.ContentLength)) {
    throw new Error('S3 object metadata is incomplete')
  }
  return {
    accountId,
    contentHash,
    contentLength: head.ContentLength as number,
    contentType: head.ContentType ?? null,
    createdAt,
    generation,
    key,
    namespace: 'assets',
  }
}

export function createS3ObjectStore(options: S3ObjectStoreOptions): SyncObjectStore {
  const client = new S3Client({
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    region: options.region,
    ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    ...(options.accessKeyId === undefined || options.secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }),
  })
  const head = async (accountId: string, key: string): Promise<SyncObjectMetadata | null> => {
    ensureAccountKey(accountId, key)
    try {
      const response = await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }))
      return metadataFromHead(accountId, key, response)
    }
    catch (error) {
      if (isMissing(error))
        return null
      throw error
    }
  }

  return {
    close: () => client.destroy(),
    verify: async () => {
      await client.send(new HeadBucketCommand({ Bucket: options.bucket }))
      const key = `.memorilo-health/${randomUUID()}`
      let created = false
      try {
        await client.send(new PutObjectCommand({
          Body: '',
          Bucket: options.bucket,
          ContentLength: 0,
          IfNoneMatch: '*',
          Key: key,
        }))
        created = true
        await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }))
        const listed = await client.send(new ListObjectsV2Command({
          Bucket: options.bucket,
          MaxKeys: 1,
          Prefix: key,
        }))
        if (!listed.Contents?.some(item => item.Key === key))
          throw new Error('S3 object-store probe was not visible after write')
      }
      finally {
        if (created)
          await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
      }
    },
    delete: async (accountId, key) => {
      ensureAccountKey(accountId, key)
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
    },
    get: async (accountId, key) => {
      ensureAccountKey(accountId, key)
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }))
        const body = response.Body
        if (body === undefined || !(Symbol.asyncIterator in body))
          throw new Error('S3 object response is not streamable')
        return {
          body: (async function* () {
            for await (const chunk of body as AsyncIterable<Uint8Array>)
              yield chunk
          })(),
          metadata: metadataFromHead(accountId, key, response),
        }
      }
      catch (error) {
        if (isMissing(error))
          return null
        throw error
      }
    },
    head,
    list: async (accountId, cursor, limit = 100) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
        throw new RangeError('Object list limit must be between 1 and 1000')
      const response = await client.send(new ListObjectsV2Command({
        Bucket: options.bucket,
        MaxKeys: limit,
        Prefix: `tenants/${accountId}/`,
        StartAfter: cursor,
      }))
      const keys = (response.Contents ?? []).flatMap(item => item.Key === undefined ? [] : [item.Key])
      const items = (await Promise.all(keys.map(key => head(accountId, key)))).filter((item): item is SyncObjectMetadata => item !== null)
      return { cursor: response.IsTruncated ? keys.at(-1) ?? null : null, items }
    },
    putImmutable: async (metadata, body) => {
      assertMetadata(metadata)
      try {
        await client.send(new PutObjectCommand({
          Body: Readable.from(body),
          Bucket: options.bucket,
          ChecksumSHA256: Buffer.from(metadata.contentHash, 'hex').toString('base64'),
          ContentLength: metadata.contentLength,
          ContentType: metadata.contentType ?? undefined,
          IfNoneMatch: '*',
          Key: metadata.key,
          Metadata: metadataHeaders(metadata),
        }))
      }
      catch (error) {
        if (!isPreconditionFailure(error))
          throw error
        const existing = await head(metadata.accountId, metadata.key)
        if (existing === null || !sameMetadata(existing, metadata))
          throw new Error('Object key already contains different data', { cause: error })
      }
    },
  }
}
