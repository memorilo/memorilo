import type { DesktopThemePreference } from '@memorilo/desktop-config'
import type { UiThemeAppearance } from '@memorilo/ui'
import { getUiThemeClass, getUiThemeCssVariables } from '@memorilo/ui'

const appliedThemeClass = new WeakMap<Document, string>()

export function resolveThemeAppearance(
  preference: DesktopThemePreference,
  systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches,
): UiThemeAppearance {
  return preference.appearance === 'system'
    ? (systemDark ? 'dark' : 'light')
    : preference.appearance
}

export function applyDesktopTheme(
  preference: DesktopThemePreference,
  systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches,
): UiThemeAppearance {
  const root = document.documentElement
  const appearance = resolveThemeAppearance(preference, systemDark)
  const nextClass = getUiThemeClass(preference.family, appearance)
  const previousClass = appliedThemeClass.get(document)
  if (previousClass !== nextClass) {
    if (previousClass)
      root.classList.remove(...previousClass.split(/\s+/).filter(Boolean))
    root.classList.add(...nextClass.split(/\s+/).filter(Boolean))
    appliedThemeClass.set(document, nextClass)
  }
  root.dataset.uiThemeFamily = preference.family
  root.dataset.uiThemeAppearance = preference.appearance
  root.dataset.uiThemeResolvedAppearance = appearance
  root.style.colorScheme = appearance
  for (const [name, value] of Object.entries(getUiThemeCssVariables(preference.family, appearance)))
    root.style.setProperty(name, value)
  return appearance
}
