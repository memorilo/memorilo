import type { z } from 'zod'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Switch } from '@memorilo/components/ui/switch'
import { cn } from '@memorilo/utils/utils'
import * as React from 'react'
import { unwrapSchema } from '~/lib/zod'

interface BaseInputProps {
  value: any
  onChange: (val: any) => void
}

interface EnumInputProps extends BaseInputProps {
  children: React.ReactNode
}

export function EnumInputOption({ value, children }: { value: string, children: React.ReactNode }) {
  return <option value={value}>{children}</option>
}

export function EnumInput({ value, onChange, children }: EnumInputProps) {
  return (
    <select
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive md:text-sm',
      )}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      aria-label="Select an option"
    >
      {
        (!value || value === '') && (
          <option value="" disabled>Select an option</option>
        )
      }
      {children}
    </select>
  )
}

export function StringInput({ value, onChange }: BaseInputProps) {
  return <Input value={value || ''} onChange={e => onChange(e.target.value)} />
}

export function NumberInput({ value, onChange }: BaseInputProps) {
  return <Input type="number" value={value || ''} onChange={e => onChange(Number(e.target.value))} />
}

export function BooleanInput({ value, onChange }: BaseInputProps) {
  return (
    <div className="flex items-center space-x-2 justify-end">
      <Switch
        checked={!!value}
        onCheckedChange={onChange}
      />
    </div>
  )
}

interface ObjectInputProps extends BaseInputProps {
  schema: z.ZodType<any>
  catalogKey: string
  itemKey: string
  renderInput: (props: any) => React.ReactNode
}

export function ObjectInput({ schema, value, onChange, catalogKey, itemKey, renderInput }: ObjectInputProps) {
  const unwrapped = unwrapSchema(schema)
  const shape = (unwrapped as z.ZodObject<any>).shape
  return (
    <div className="pl-4 border-l-2 space-y-2">
      {Object.entries(shape).map(([key, subSchema]) => (
        <div key={key}>
          <label className="text-xs text-muted-foreground">{key}</label>
          {renderInput({
            schema: subSchema as z.ZodType<any>,
            catalogKey,
            itemKey,
            value: value?.[key],
            onChange: (val: any) => onChange({ ...value, [key]: val }),
          })}
        </div>
      ))}
    </div>
  )
}

interface ArrayInputProps extends BaseInputProps {
  schema: z.ZodType<any>
  catalogKey: string
  itemKey: string
  renderInput: (props: any) => React.ReactNode
}

export function ArrayInput({ schema, value, onChange, catalogKey, itemKey, renderInput }: ArrayInputProps) {
  const unwrapped = unwrapSchema(schema)
  const elementSchema = (unwrapped as z.ZodArray<any>).element
  const list = Array.isArray(value) ? value : []
  return (
    <div className="space-y-2">
      {list.map((item: any, index: number) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="flex gap-2 items-start">
          <div className="flex-1">
            {renderInput({
              schema: elementSchema,
              catalogKey,
              itemKey,
              value: item,
              onChange: (val: any) => {
                const newList = [...list]
                newList[index] = val
                onChange(newList)
              },
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Remove Item"
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
        aria-label="Add item to list"
        onClick={() => {
          onChange([...list, undefined])
        }}
      >
        Add Item
      </Button>
    </div>
  )
}
