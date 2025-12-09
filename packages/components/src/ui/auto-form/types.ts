import type * as React from 'react'
import type { z } from 'zod'

export interface SettingItem<T = any> {
  key: string
  label: string
  schema: z.ZodType<T>
  defaultValue?: T
  component?: (props: { value: T, onChange: (value: T) => void }) => React.ReactNode
}

export interface Catalog {
  key: string
  items: SettingItem[]
}

export interface AutoFormProps {
  catalogs: Catalog[]
  defaultValues: Record<string, any>
  onSave: (values: Record<string, any>) => void
}
