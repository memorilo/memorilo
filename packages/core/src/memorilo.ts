import { SettingStore } from './utils/settings'

export class Memorilo {
  private preInitializeFunctions = new Set<(memorilo: Memorilo) => void | Promise<void>> ()
  private initializeFunctions = new Set<(memorilo: Memorilo) => void | Promise<void>> ()
  private ready: boolean = false

  settings = new SettingStore()

  public registerPreInitializeFunction(func: (memorilo: Memorilo) => void | Promise<void>): void {
    if (this.ready) {
      throw new Error('Cannot register initialize function after memorilo is ready.')
    }
    this.preInitializeFunctions.add(func)
  }

  public registerInitializeFunction(func: (memorilo: Memorilo) => void | Promise<void>): void {
    if (this.ready) {
      throw new Error('Cannot register initialize function after memorilo is ready.')
    }
    this.initializeFunctions.add(func)
  }

  async initialize() {
    await Promise.all(Array.from(this.preInitializeFunctions).map(func => func(this)))
    await Promise.all(Array.from(this.initializeFunctions).map(func => func(this)))
    this.ready = true
  }
}

export const memorilo = new Memorilo()
