import type { SettingItem } from '@memorilo/core/utils/settings'

export type { SettingItem } from '@memorilo/core/utils/settings'

export interface Catalog {
  key: string
  items: SettingItem[]
}

export interface AutoFormProps {
  catalog: Catalog
  defaultValues: Record<string, any>
  onChange: (values: Record<string, any>) => void
}
