import { Layer, ManagedRuntime } from 'effect'
import { createEffectQueryFromManagedRuntime } from 'effect-query'

export type {
  Error,
  ErrorKind,
  FolderNode,
  FolderNodeType,
  JournalCursor,
  JournalEntry,
  JournalPage,
} from './native/bindings.gen'

export const managedRuntime = ManagedRuntime.make(Layer.empty)
export const eq = createEffectQueryFromManagedRuntime(managedRuntime)
