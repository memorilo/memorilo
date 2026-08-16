import { toError } from '@memorilo/effect-lifecycle'
import { Schema } from 'effect'

const strictParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

const DesktopIpcDetailSchema = Schema.Union([
  Schema.Boolean,
  Schema.Null,
  Schema.Number,
  Schema.String,
])

export const DesktopIpcFailureSchema = Schema.Struct({
  code: Schema.NonEmptyString,
  details: Schema.Record(Schema.String, DesktopIpcDetailSchema),
  message: Schema.String,
  name: Schema.NonEmptyString,
})

const DesktopIpcEnvelopeSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal('failure'),
    error: DesktopIpcFailureSchema,
  }),
  Schema.Struct({
    status: Schema.Literal('success'),
    value: Schema.Unknown,
  }),
])

export type DesktopIpcFailure = typeof DesktopIpcFailureSchema.Type
export type DesktopIpcEnvelope = typeof DesktopIpcEnvelopeSchema.Type

export class DesktopIpcError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, boolean | null | number | string>>
  readonly operation: string
  readonly remoteName: string

  constructor(operation: string, failure: DesktopIpcFailure) {
    super(failure.message)
    this.name = 'DesktopIpcError'
    this.code = failure.code
    this.details = failure.details
    this.operation = operation
    this.remoteName = failure.name
  }
}

export class DesktopIpcProtocolError extends Error {
  readonly operation: string

  constructor(operation: string, cause: unknown) {
    const error = toError(cause)
    super(`Desktop IPC operation ${operation} returned an invalid response: ${error.message}`, { cause })
    this.name = 'DesktopIpcProtocolError'
    this.operation = operation
  }
}

function errorName(error: Error): string {
  try {
    const name = error.name
    return typeof name === 'string' && name.length > 0 ? name : 'Error'
  }
  catch {
    return 'Error'
  }
}

function errorMessage(error: Error): string {
  try {
    const message = error.message
    return typeof message === 'string' ? message : 'Desktop IPC operation failed'
  }
  catch {
    return 'Desktop IPC operation failed'
  }
}

function readErrorCode(error: Error): string {
  try {
    const tag = Reflect.get(error, '_tag')
    if (typeof tag === 'string' && tag.length > 0)
      return tag
  }
  catch {
    // A hostile Error subclass must not break failure transport.
  }
  return errorName(error)
}

function errorDetails(error: Error): Record<string, boolean | null | number | string> {
  const details: Record<string, boolean | null | number | string> = {}
  try {
    for (const [key, value] of Object.entries(error)) {
      if (key === '_tag' || key === 'cause' || key === 'message' || key === 'name' || key === 'stack')
        continue
      if (value === null || typeof value === 'boolean' || typeof value === 'string')
        details[key] = value
      else if (typeof value === 'number' && Number.isFinite(value))
        details[key] = value
    }
  }
  catch {
    // A hostile Error subclass must not break failure transport.
  }
  return details
}

export function desktopIpcFailure(cause: unknown): DesktopIpcEnvelope {
  let error: Error
  try {
    error = toError(cause)
  }
  catch {
    error = new Error('Desktop IPC operation failed with a non-serializable cause')
  }
  return {
    error: {
      code: readErrorCode(error),
      details: errorDetails(error),
      message: errorMessage(error),
      name: errorName(error),
    },
    status: 'failure',
  }
}

export function desktopIpcSuccess(value: unknown): DesktopIpcEnvelope {
  return { status: 'success', value }
}

export function decodeDesktopIpcEnvelope(operation: string, value: unknown): DesktopIpcEnvelope {
  try {
    return Schema.decodeUnknownSync(DesktopIpcEnvelopeSchema)(value, strictParseOptions)
  }
  catch (cause) {
    throw new DesktopIpcProtocolError(operation, cause)
  }
}
