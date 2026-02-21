export enum ModeEnum {
  development = 'development',
  staging = 'staging',
  production = 'production',
}

export enum PlatformEnum {
  web = 'web',
  android = 'android',
  ios = 'ios',
  linux = 'linux',
  windows = 'windows',
  macos = 'macos',
}

const { TAURI, PLATFORM } = globalThis as typeof globalThis & {
  TAURI: boolean
  PLATFORM: PlatformEnum
}

declare global {
  const TAURI: boolean
  const PLATFORM: PlatformEnum
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

export { PLATFORM, TAURI }

export function isWebPlatform(platform: PlatformEnum = PLATFORM) {
  return platform === PlatformEnum.web
}
export function isMobilePlatform(platform: PlatformEnum = PLATFORM) {
  return platform === PlatformEnum.android || platform === PlatformEnum.ios
}
export function isDesktopPlatform(platform: PlatformEnum = PLATFORM) {
  return platform === PlatformEnum.linux || platform === PlatformEnum.windows || platform === PlatformEnum.macos
}
export function isApplePlatform(platform: PlatformEnum = PLATFORM) {
  return platform === PlatformEnum.ios || platform === PlatformEnum.macos
}
