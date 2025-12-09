import type { z } from 'zod'
import { cn } from '@memorilo/utils/utils'
import * as React from 'react'
import { Button } from '../button'
import { Input } from '../input'
import { getZodType, unwrapSchema } from './utils'

interface FormInputProps {
  schema: z.ZodType<any>
  value: any
  onChange: (val: any) => void
  component?: (props: { value: any, onChange: (value: any) => void }) => React.ReactNode
}

export function FormInput({ schema, value, onChange, component }: FormInputProps) {
  if (component) {
    return component({ value, onChange })
  }

  const unwrapped = unwrapSchema(schema)
  const type = getZodType(unwrapped)

  if (type === 'enum') {
    const def = (unwrapped as any)._def
    let options: any[] = []

    if (def.typeName === 'ZodEnum' || Array.isArray((unwrapped as any).options)) {
      options = (unwrapped as any).options
    }
    else if (def.typeName === 'ZodNativeEnum' || (unwrapped as any).enum) {
      options = Object.values((unwrapped as any).enum).filter(val => typeof val === 'string')
    }

    return (
      <select
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive md:text-sm',
        )}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="" disabled>Select an option</option>
        {options.map((opt: any) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }

  if (type === 'string') {
    return <Input value={value || ''} onChange={e => onChange(e.target.value)} />
  }
  if (type === 'number') {
    return <Input type="number" value={value || ''} onChange={e => onChange(Number(e.target.value))} />
  }
  if (type === 'boolean') {
    return (
      <div className="flex items-center space-x-2">
        <Input
          type="checkbox"
          className="h-4 w-4"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
        />
      </div>
    )
  }
  if (type === 'object') {
    const shape = (unwrapped as z.ZodObject<any>).shape
    return (
      <div className="pl-4 border-l-2 space-y-2">
        {Object.entries(shape).map(([key, subSchema]) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground">{key}</label>
            <FormInput
              schema={subSchema as z.ZodType<any>}
              value={value?.[key]}
              onChange={val => onChange({ ...value, [key]: val })}
            />
          </div>
        ))}
      </div>
    )
  }
  if (type === 'array') {
    const elementSchema = (unwrapped as z.ZodArray<any>).element
    const list = Array.isArray(value) ? value : []
    return (
      <div className="space-y-2">
        {list.map((item: any, index: number) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="flex gap-2 items-start">
            <div className="flex-1">
              <FormInput
                schema={elementSchema}
                value={item}
                onChange={(val) => {
                  const newList = [...list]
                  newList[index] = val
                  onChange(newList)
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newList = list.filter((_: any, i: number) => i !== index)
                onChange(newList)
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...list, undefined])
          }}
        >
          Add Item
        </Button>
      </div>
    )
  }

  return <div>Unsupported type</div>
}
