import {
  AssetsService,
  DialogService,
  DocService,
  FolderService,
  JournalService,
  SettingsService,
  SystemService,
  ToastEventService,
} from '@memorilo/api-spec/command'
import { FileService } from '@memorilo/api-spec/file'
import { OpenerService } from '@memorilo/api-spec/opener'
import { OSService } from '@memorilo/api-spec/os'
import * as tauriDialog from '@tauri-apps/plugin-dialog'
import { Layer, ManagedRuntime } from 'effect'
import * as EffectConsole from 'effect/Console'
import { events } from './bindings.gen'
import { effectAssetsCommands } from './commands/assets'
import { effectDocCommands } from './commands/doc'
import { effectFolderCommands } from './commands/folder'
import { effectJournalCommands } from './commands/journal'
import { effectSettingsCommands } from './commands/settings'
import { effectSystemCommands } from './commands/system'
import { fileService } from './file'
import { consoleService } from './log'
import { openerService } from './opener'
import { osService } from './os'

const dialogService = {
  ask: (message: string, options?: Parameters<typeof tauriDialog.ask>[1]) =>
    tauriDialog.ask(message, options),
}

const clientLayer = Layer.mergeAll(
  Layer.succeed(FolderService, effectFolderCommands),
  Layer.succeed(SettingsService, effectSettingsCommands),
  Layer.succeed(DocService, effectDocCommands),
  Layer.succeed(SystemService, effectSystemCommands),
  Layer.succeed(AssetsService, effectAssetsCommands),
  Layer.succeed(JournalService, effectJournalCommands),
  Layer.succeed(EffectConsole.Console, consoleService),
  Layer.succeed(DialogService, dialogService),
  Layer.succeed(ToastEventService, events.toastEvent),
  Layer.succeed(OSService, osService),
  Layer.succeed(FileService, fileService),
  Layer.succeed(OpenerService, openerService),
)

export const clientRuntime = ManagedRuntime.make(clientLayer)
