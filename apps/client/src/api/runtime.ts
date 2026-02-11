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
import * as tauriDialog from '@tauri-apps/plugin-dialog'
import { Layer, ManagedRuntime } from 'effect'
import * as EffectConsole from 'effect/Console'
import { assetsHandlers } from './assets'
import { events } from './bindings.gen'
import { docHandlers } from './doc'
import { fileHandlers } from './file'
import { folderHandlers } from './folder'
import { journalHandlers } from './journal'
import { consoleHandlers } from './log'
import { openerHandlers } from './opener'
import { osHandlers } from './os'
import { settingsHandlers } from './settings'
import { systemHandlers } from './system'

const dialogHandlers = {
  ask: (message: string, options?: Parameters<typeof tauriDialog.ask>[1]) =>
    tauriDialog.ask(message, options),
}

const toastEventHandlers = events.toastEvent

const clientLayer = Layer.mergeAll(
  Layer.succeed(FolderService, folderHandlers),
  Layer.succeed(SettingsService, settingsHandlers),
  Layer.succeed(DocService, docHandlers),
  Layer.succeed(SystemService, systemHandlers),
  Layer.succeed(AssetsService, assetsHandlers),
  Layer.succeed(JournalService, journalHandlers),
  Layer.succeed(EffectConsole.Console, consoleHandlers),
  Layer.succeed(DialogService, dialogHandlers),
  Layer.succeed(ToastEventService, toastEventHandlers),
  Layer.succeed(OSService, osHandlers),
  Layer.succeed(FileService, fileHandlers),
  Layer.succeed(OpenerService, openerHandlers),
)

export const clientRuntime = ManagedRuntime.make(clientLayer)
