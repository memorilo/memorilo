export class Disposable {
  private disposed = false
  constructor(private readonly callOnDispose: () => void) {}
  static from(...disposables: Disposable[]): Disposable {
    return new Disposable(() => {
      disposables.forEach(d => d.dispose())
    })
  }

  static fromExternal<T extends (...args: any[]) => any>(func: T, subscribe: (cb: T) => any, unsubscribe?: (cb: T) => any): Disposable {
    const unsubscribeFunc = subscribe(func)
    return new Disposable(() => {
      if (typeof unsubscribe === 'function') {
        unsubscribeFunc()
      }
      if (unsubscribe) {
        unsubscribe(func)
      }
    })
  }

  dispose() {
    if (this.disposed)
      return
    this.callOnDispose()
    this.disposed = true
  }
}
