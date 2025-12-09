import type { z } from 'zod'
import type { AutoFormProps } from './types'
import * as React from 'react'
import { Button } from '../button'
import { FormInput } from './form-input'

export type { AutoFormProps, Catalog, SettingItem } from './types'

export function AutoForm({ catalogs, defaultValues, onSave }: AutoFormProps) {
  const [values, setValues] = React.useState(defaultValues)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const handleChange = (key: string, value: any, schema: z.ZodType<any>) => {
    setValues(prev => ({ ...prev, [key]: value }))

    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      setErrors(prev => ({ ...prev, [key]: parsed.error.issues[0]?.message || 'Invalid value' }))
    }
    else {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  return (
    <div className="space-y-8">
      {catalogs.map(catalog => (
        <div key={catalog.key} id={catalog.key} className="space-y-2 rounded-lg scroll-mt-4">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-border" />
            <h3 className="text-lg font-semibold">{catalog.key}</h3>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4">
            {catalog.items.map((item) => {
              const fullKey = `${catalog.key}::${item.key}`
              return (
                <div key={item.key} className="grid gap-2 p-4 rounded hover:bg-secondary">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {item.label}
                  </label>
                  <FormInput
                    schema={item.schema}
                    value={values[fullKey]}
                    onChange={val => handleChange(fullKey, val, item.schema)}
                    component={item.component}
                  />
                  {errors[fullKey] && (
                    <p className="text-sm font-medium text-destructive">{errors[fullKey]}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <Button onClick={() => onSave(values)}>Save Changes</Button>
    </div>
  )
}
