export interface DeviceSigner {
  readonly publicKey: string
  readonly sign: (payload: Uint8Array) => string
}

export interface DeviceSigningKeyStore {
  readonly load: () => Promise<string | null>
  readonly save: (privateKey: string) => Promise<void>
}
