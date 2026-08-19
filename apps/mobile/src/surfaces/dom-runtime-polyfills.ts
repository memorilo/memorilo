function fallbackRandomValues<T extends ArrayBufferView>(target: T): T {
  const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength)
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Math.floor(Math.random() * 256)
  return target
}

function createRandomUuid(): string {
  const bytes = new Uint8Array(16)
  const cryptoObject = globalThis.crypto
  if (typeof cryptoObject?.getRandomValues === 'function')
    cryptoObject.getRandomValues(bytes)
  else
    fallbackRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0F) | 0x40
  bytes[8] = (bytes[8]! & 0x3F) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function ensureDomRuntimePolyfills(): void {
  const cryptoObject = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined
  if (cryptoObject && typeof cryptoObject.randomUUID !== 'function') {
    Object.defineProperty(cryptoObject, 'randomUUID', {
      configurable: true,
      value: createRandomUuid,
      writable: true,
    })
  }
}
