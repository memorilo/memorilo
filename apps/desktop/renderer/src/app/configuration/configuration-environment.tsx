import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useEffect, useSyncExternalStore } from 'react'
import { resolveConfigLanguage, setI18nLanguage } from '../../i18n'
import { DesktopConfigurationContext } from '../../shared/configuration'
import { applyDesktopTheme } from './theme-runtime'

export function DesktopConfigurationEnvironment({
  children,
  store,
}: {
  children: ReactNode
  store: ConfigurationStore<DesktopConfiguration>
}) {
  const configuration = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    document.documentElement.lang = configuration.language === 'system'
      ? navigator.language
      : configuration.language
    setI18nLanguage(resolveConfigLanguage(configuration.language))
  }, [configuration.language])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(configuration.reduceMotion)
  }, [configuration.reduceMotion])

  useEffect(() => {
    const cursor = configuration.editor.cursor
    const root = document.documentElement
    root.dataset.editorCursorAnimationLength = String(cursor.animationLength)
    root.dataset.editorCursorShortAnimationLength = String(cursor.shortAnimationLength)
    root.dataset.editorCursorTrailSize = String(cursor.trailSize)
    root.dataset.editorCursorVfxMode = cursor.vfxMode
    root.dataset.editorCursorVfxOpacity = String(cursor.vfxOpacity)
    root.dataset.editorCursorVfxParticleLifetime = String(cursor.vfxParticleLifetime)
    root.dataset.editorCursorVfxParticleDensity = String(cursor.vfxParticleDensity)
    root.dataset.editorCursorVfxParticleSpeed = String(cursor.vfxParticleSpeed)
    root.dataset.editorCursorSmoothBlink = String(cursor.smoothBlink)
  }, [configuration.editor.cursor])

  useEffect(() => {
    applyDesktopTheme(configuration.theme)
  }, [configuration.theme])

  useEffect(() => {
    if (configuration.theme.appearance !== 'system')
      return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyDesktopTheme(configuration.theme, media.matches)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [configuration.theme])

  return (
    <DesktopConfigurationContext value={configuration}>
      <MotionConfig reducedMotion={configuration.reduceMotion ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </DesktopConfigurationContext>
  )
}
