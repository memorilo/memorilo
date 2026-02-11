export interface Channel<T = unknown> {
  id: number
  onmessage: (response: T) => void
}
