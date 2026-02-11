import { Data, Effect } from 'effect'

export class ResourceReadError extends Data.TaggedError('ResourceReadError')<{
  path: string
  message: string
}> {}

export interface FileHandlers {
  readonly resolveResource: (path: string) => Effect.Effect<string, unknown>
  readonly readFile: (path: string) => Effect.Effect<Uint8Array, unknown>
  readonly readResource: (path: string) => Effect.Effect<Uint8Array, ResourceReadError>
  readonly readResourceText: (path: string) => Effect.Effect<string, ResourceReadError>
}

export class FileService extends Effect.Tag('FileService')<FileService, FileHandlers>() {}
