import type { SettingItem } from '@memorilo/core/utils/settings'

export type { SettingItem } from '@memorilo/core/utils/settings'

export interface Catalog {
  key: string
  items: SettingItem[]
}

export interface AutoFormProps {
  catalogs: Catalog[]
  defaultValues: Record<string, any>
  onSave: (values: Record<string, any>) => void
}
