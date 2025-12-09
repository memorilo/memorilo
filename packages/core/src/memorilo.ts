import { SettingStore } from './utils/settings'

export class Memorilo {
  private initializeFunctions = new Set<(memorilo: Memorilo) => void | Promise<void>> ()
  private ready: boolean = false

  settings = new SettingStore()

  public registerInitializeFunction(func: (memorilo: Memorilo) => void | Promise<void>): void {
    if (this.ready) {
      throw new Error('Cannot register initialize function after memorilo is ready.')
    }
    this.initializeFunctions.add(func)
  }

  async initialize() {
    await Promise.all(Array.from(this.initializeFunctions).map(func => func(this)))
    this.ready = true
  }
}

export const memorilo = new Memorilo()
