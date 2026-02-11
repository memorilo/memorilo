import type { AssetsHandlers } from '@memorilo/api-spec/services/assets'
import type { DialogHandlers } from '@memorilo/api-spec/services/dialog'
import type { DocHandlers } from '@memorilo/api-spec/services/doc'
import type { FileHandlers } from '@memorilo/api-spec/services/file'
import type { FolderHandlers } from '@memorilo/api-spec/services/folder'
import type { JournalHandlers } from '@memorilo/api-spec/services/journal'
import type { OpenerHandlers } from '@memorilo/api-spec/services/opener'
import type { OSHandlers } from '@memorilo/api-spec/services/os'
import type { SettingsHandlers } from '@memorilo/api-spec/services/settings'
import type { SystemHandlers } from '@memorilo/api-spec/services/system'
import type { ToastEventHandlers } from '@memorilo/api-spec/services/toast'
import { AssetsService } from '@memorilo/api-spec/services/assets'
import { DialogService } from '@memorilo/api-spec/services/dialog'
import { DocService } from '@memorilo/api-spec/services/doc'
import { FileService } from '@memorilo/api-spec/services/file'
import { FolderService } from '@memorilo/api-spec/services/folder'
import { JournalService } from '@memorilo/api-spec/services/journal'
import { OpenerService } from '@memorilo/api-spec/services/opener'
import { OSService } from '@memorilo/api-spec/services/os'
import { SettingsService } from '@memorilo/api-spec/services/settings'
import { SystemService } from '@memorilo/api-spec/services/system'
import { ToastEventService } from '@memorilo/api-spec/services/toast'
import { Effect, Layer, ManagedRuntime } from 'effect'

function unsupportedCommands<T>(name: string) {
  return new Proxy({}, {
    get(_target, prop) {
      return (..._args: any[]) =>
        Effect.fail(new Error(`Command ${name}.${String(prop)} is not supported on web`))
    },
  }) as T
}

const folderHandlers: FolderHandlers = unsupportedCommands('FolderService')
const docHandlers: DocHandlers = unsupportedCommands('DocService')
const assetsHandlers: AssetsHandlers = unsupportedCommands('AssetsService')
const journalHandlers: JournalHandlers = unsupportedCommands('JournalService')
const settingsHandlers: SettingsHandlers = unsupportedCommands('SettingsService')
const systemHandlers: SystemHandlers = unsupportedCommands('SystemService')
const dialogHandlers: DialogHandlers = unsupportedCommands('DialogService')
const toastEventHandlers: ToastEventHandlers = unsupportedCommands('ToastEventService')
const osHandlers: OSHandlers = unsupportedCommands('OSService')
const fileHandlers: FileHandlers = unsupportedCommands('FileService')
const openerHandlers: OpenerHandlers = unsupportedCommands('OpenerService')

const webLayer = Layer.mergeAll(
  Layer.succeed(FolderService, folderHandlers),
  Layer.succeed(SettingsService, settingsHandlers),
  Layer.succeed(DocService, docHandlers),
  Layer.succeed(SystemService, systemHandlers),
  Layer.succeed(AssetsService, assetsHandlers),
  Layer.succeed(JournalService, journalHandlers),
  Layer.succeed(DialogService, dialogHandlers),
  Layer.succeed(ToastEventService, toastEventHandlers),
  Layer.succeed(OSService, osHandlers),
  Layer.succeed(FileService, fileHandlers),
  Layer.succeed(OpenerService, openerHandlers),
)

export const webRuntime = ManagedRuntime.make(webLayer)
