import type { Schema as EffectSchema } from 'effect'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { toError } from '@memorilo/effect-lifecycle'
import { Schema } from 'effect'

const strictParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

const DesktopHonoDetailSchema = Schema.Union([
  Schema.Boolean,
  Schema.Null,
  Schema.Number,
  Schema.String,
])

export const DesktopHonoFailureSchema = Schema.Struct({
  error: Schema.Struct({
    code: Schema.NonEmptyString,
    details: Schema.Record(Schema.String, DesktopHonoDetailSchema),
    message: Schema.String,
    name: Schema.NonEmptyString,
    operation: Schema.NonEmptyString,
  }),
  status: Schema.Literal('failure'),
})

export type DesktopHonoFailure = typeof DesktopHonoFailureSchema.Type

export class DesktopHonoError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, boolean | null | number | string>>
  readonly operation: string
  readonly remoteName: string
  readonly status: number

  constructor(status: number, failure: DesktopHonoFailure) {
    super(failure.error.message)
    this.name = 'DesktopHonoError'
    this.code = failure.error.code
    this.details = failure.error.details
    this.operation = failure.error.operation
    this.remoteName = failure.error.name
    this.status = status
  }
}

export class DesktopHonoProtocolError extends Error {
  readonly operation: string

  constructor(operation: string, message: string, options?: ErrorOptions) {
    super(`Desktop request ${operation} returned an invalid response: ${message}`, options)
    this.name = 'DesktopHonoProtocolError'
    this.operation = operation
  }
}

export class DesktopHonoRequestError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, boolean | null | number | string>>
  readonly operation: string
  readonly status: ContentfulStatusCode

  constructor(
    operation: string,
    message: string,
    options: {
      cause?: unknown
      code?: string
      details?: Readonly<Record<string, boolean | null | number | string>>
      status?: ContentfulStatusCode
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'DesktopHonoRequestError'
    this.code = options.code ?? 'InvalidRequest'
    this.details = options.details ?? {}
    this.operation = operation
    this.status = options.status ?? 400
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
    return typeof message === 'string' ? message : 'Desktop request failed'
  }
  catch {
    return 'Desktop request failed'
  }
}

function errorCode(error: Error): string {
  if (error instanceof DesktopHonoRequestError)
    return error.code
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
  if (error instanceof DesktopHonoRequestError)
    return { ...error.details }
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

export function desktopHonoFailure(operation: string, cause: unknown): DesktopHonoFailure {
  let error: Error
  try {
    error = toError(cause)
  }
  catch {
    error = new Error('Desktop request failed with a non-serializable cause')
  }
  return {
    error: {
      code: errorCode(error),
      details: errorDetails(error),
      message: errorMessage(error),
      name: errorName(error),
      operation,
    },
    status: 'failure',
  }
}

export function decodeDesktopHonoValue<S extends EffectSchema.Top & { readonly DecodingServices: never }>(
  operation: string,
  schema: S,
  value: unknown,
): S['Type'] {
  try {
    return Schema.decodeUnknownSync(schema)(value, strictParseOptions)
  }
  catch (cause) {
    const error = toError(cause)
    throw new DesktopHonoProtocolError(operation, error.message, { cause })
  }
}

export function decodeDesktopHonoInput<S extends EffectSchema.Top & { readonly DecodingServices: never }>(
  operation: string,
  schema: S,
  value: unknown,
): S['Type'] {
  try {
    return Schema.decodeUnknownSync(schema)(value, strictParseOptions)
  }
  catch (cause) {
    const error = toError(cause)
    throw new DesktopHonoRequestError(operation, `Invalid request body: ${error.message}`, { cause })
  }
}

export function encodeDesktopHonoValue<S extends EffectSchema.Top & { readonly EncodingServices: never }>(
  operation: string,
  schema: S,
  value: unknown,
): S['Encoded'] {
  try {
    return Schema.encodeUnknownSync(schema)(value, strictParseOptions)
  }
  catch (cause) {
    const error = toError(cause)
    throw new DesktopHonoProtocolError(operation, `value cannot be encoded: ${error.message}`, { cause })
  }
}

export async function decodeDesktopHonoResponse<S extends EffectSchema.Top & { readonly DecodingServices: never }>(
  operation: string,
  response: Response,
  schema: S,
): Promise<S['Type']> {
  let value: unknown
  try {
    value = await response.json()
  }
  catch (cause) {
    const error = toError(cause)
    throw new DesktopHonoProtocolError(operation, `response body is not valid JSON: ${error.message}`, { cause })
  }

  if (!response.ok) {
    let failure: DesktopHonoFailure
    try {
      failure = Schema.decodeUnknownSync(DesktopHonoFailureSchema)(value, strictParseOptions)
    }
    catch (cause) {
      const error = toError(cause)
      throw new DesktopHonoProtocolError(operation, `failure body is invalid: ${error.message}`, { cause })
    }
    throw new DesktopHonoError(response.status, failure)
  }

  return decodeDesktopHonoValue(operation, schema, value)
}
