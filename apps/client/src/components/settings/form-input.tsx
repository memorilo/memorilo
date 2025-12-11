import type { z } from 'zod'
import { Match } from 'effect'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { getEnumOptions, getZodType, unwrapSchema } from '~/lib/zod'
import { ArrayInput, BooleanInput, EnumInput, EnumInputOption, NumberInput, ObjectInput, StringInput } from './inputs'

interface FormInputProps {
  schema: z.ZodType<any>
  catalogKey: string
  itemKey: string
  value: any
  onChange: (val: any) => void
  component?: (props: { value: any, onChange: (value: any) => void, schema: z.ZodType<any> }) => React.ReactNode
}

export function FormInput({ schema, catalogKey, itemKey, value, onChange, component }: FormInputProps) {
  const { t } = useTranslation('settings')
  if (component) {
    return component({ value, onChange, schema })
  }

  const unwrapped = unwrapSchema(schema)
  const type = getZodType(unwrapped)
  return Match.value(type)
    .pipe(
      Match.when('enum', () => {
        let options: any[] = getEnumOptions(schema)
        options = options.filter(v => typeof v === 'string' && !v.startsWith('_'))

        return (
          <EnumInput value={value} onChange={onChange}>
            {options
              .map((opt: any) => (
                <EnumInputOption key={opt} value={opt}>
                  {t(`${catalogKey}.${itemKey}.options.${opt}`, opt)}
                </EnumInputOption>
              ))}
          </EnumInput>
        )
      }),
      Match.when('string', () => <StringInput value={value} onChange={onChange} />),
      Match.when('number', () => <NumberInput value={value} onChange={onChange} />),
      Match.when('boolean', () => <BooleanInput value={value} onChange={onChange} />),
      Match.when('object', () => (
        <ObjectInput
          schema={schema}
          value={value}
          onChange={onChange}
          catalogKey={catalogKey}
          itemKey={itemKey}
          renderInput={props => <FormInput {...props} />}
        />
      )),
      Match.when('array', () => (
        <ArrayInput
          schema={schema}
          value={value}
          onChange={onChange}
          catalogKey={catalogKey}
          itemKey={itemKey}
          renderInput={props => <FormInput {...props} />}
        />
      )),
      Match.orElse(() => (
        <div>
          Unsupported type:
          {' '}
          {type}
        </div>
      )),
    )
}
