import { Data } from 'effect'

export class CommandError<E = unknown> extends Data.TaggedError('CommandError')<{
  readonly error: E
}> {}
