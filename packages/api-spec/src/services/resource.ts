import type { UnknownException } from 'effect/Cause'
import { Effect } from 'effect'

export interface ResourceHandlers {
  readLanguagedetectionModelJSON: () => Effect.Effect<string, UnknownException>
  readLanguagedetectionModelWeights: () => Effect.Effect<Uint8Array, UnknownException>
}

export class ResourceService extends Effect.Tag('ResourceService')<ResourceService, ResourceHandlers>() {}
