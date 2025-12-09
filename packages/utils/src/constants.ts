export enum ModeEnum {
  development = 'development',
  staging = 'staging',
  production = 'production',
}

declare global {
  const __TAURI__: unknown
  interface ImportMetaEnv {
    MODE: string
    BASE_URL: string
    // add other VITE_... or env vars here, e.g.
    // readonly VITE_API_URL?: string
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export const MODE: ModeEnum = (import.meta.env.MODE ?? ModeEnum.development) as ModeEnum

export const PROD = MODE === ModeEnum.production
export const DEV = MODE === ModeEnum.development

export const TAURI = typeof __TAURI__ !== 'undefined'
