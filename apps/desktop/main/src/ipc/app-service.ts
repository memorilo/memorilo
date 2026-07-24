import process from 'node:process'

import { IpcMethod, IpcService } from 'electron-ipc-decorator'

export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export class AppService extends IpcService {
  static override readonly groupName = 'app'

  @IpcMethod()
  getRuntimeInfo(): RuntimeInfo {
    return {
      platform: process.platform,
      version: process.versions.electron,
    }
  }
}
