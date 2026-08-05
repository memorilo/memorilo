import type { ChangeEvent, KeyboardEvent } from 'react'
import type { ConfigurationField } from './configuration-definition'
import type { ConfigurationStore } from './configuration-store'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useState, useSyncExternalStore } from 'react'

import { configurationFieldStyles } from './configuration-fields.stylex'
import { getConfigurationValue } from './configuration-path'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function FieldControl<T extends object>({
  field,
  store,
  value,
}: {
  field: ConfigurationField
  store: ConfigurationStore<T>
  value: unknown
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const update = useCallback(async (next: unknown) => {
    setPending(true)
    setError(null)
    try {
      await store.setValue(field.path, next)
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
    finally {
      setPending(false)
    }
  }, [field.path, store])

  let control
  switch (field.control) {
    case 'number': {
      if (typeof value !== 'number')
        throw new TypeError(`Number field ${field.path} received a non-number value`)
      const commit = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.value.length === 0) {
          setError(`${field.label} requires a number`)
          return
        }
        void update(Number(event.target.value))
      }
      const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter')
          event.currentTarget.blur()
      }
      control = (
        <>
          <input
            key={`${field.path}:${value}`}
            {...stylex.props(configurationFieldStyles.input, configurationFieldStyles.numberInput)}
            aria-label={field.label}
            defaultValue={value}
            disabled={pending}
            max={field.max}
            min={field.min}
            step={field.step}
            type="number"
            onBlur={commit}
            onKeyDown={commitOnEnter}
          />
          {field.unit ? <span {...stylex.props(configurationFieldStyles.unit)}>{field.unit}</span> : null}
        </>
      )
      break
    }
    case 'select':
      if (typeof value !== 'string')
        throw new TypeError(`Select field ${field.path} received a non-string value`)
      control = (
        <select
          {...stylex.props(configurationFieldStyles.input)}
          aria-label={field.label}
          disabled={pending}
          value={value}
          onChange={event => void update(event.target.value)}
        >
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )
      break
    case 'segmented':
      if (typeof value !== 'string')
        throw new TypeError(`Segmented field ${field.path} received a non-string value`)
      control = (
        <div
          {...stylex.props(configurationFieldStyles.segmentedControl)}
          aria-label={field.label}
          role="radiogroup"
        >
          {field.options.map(option => (
            <label key={option.value} {...stylex.props(configurationFieldStyles.segmentedOption)}>
              <input
                {...stylex.props(configurationFieldStyles.segmentedInput)}
                checked={value === option.value}
                disabled={pending}
                name={field.path}
                type="radio"
                value={option.value}
                onChange={() => void update(option.value)}
              />
              <span {...stylex.props(configurationFieldStyles.segmentedLabel)}>{option.label}</span>
            </label>
          ))}
        </div>
      )
      break
    case 'text': {
      if (typeof value !== 'string')
        throw new TypeError(`Text field ${field.path} received a non-string value`)
      const commit = (event: ChangeEvent<HTMLInputElement>) => void update(event.target.value)
      control = (
        <input
          key={`${field.path}:${value}`}
          {...stylex.props(configurationFieldStyles.input)}
          aria-label={field.label}
          autoComplete={field.sensitive ? 'off' : undefined}
          defaultValue={value}
          disabled={pending}
          placeholder={field.placeholder}
          type={field.sensitive ? 'password' : 'text'}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              event.currentTarget.blur()
          }}
        />
      )
      break
    }
    case 'toggle':
      if (typeof value !== 'boolean')
        throw new TypeError(`Toggle field ${field.path} received a non-boolean value`)
      control = (
        <button
          {...stylex.props(
            configurationFieldStyles.switch,
            value && configurationFieldStyles.switchOn,
          )}
          aria-label={field.label}
          aria-checked={value}
          disabled={pending}
          role="switch"
          type="button"
          onClick={() => void update(!value)}
        >
          <span
            {...stylex.props(
              configurationFieldStyles.switchThumb,
              value && configurationFieldStyles.switchThumbOn,
            )}
          />
        </button>
      )
      break
  }

  return (
    <div {...stylex.props(configurationFieldStyles.row, pending && configurationFieldStyles.pending)}>
      <div {...stylex.props(configurationFieldStyles.copy)}>
        <span {...stylex.props(configurationFieldStyles.label)}>{field.label}</span>
        {field.description
          ? <p {...stylex.props(configurationFieldStyles.description)}>{field.description}</p>
          : null}
      </div>
      <div {...stylex.props(configurationFieldStyles.controlSlot)}>{control}</div>
      {error ? <p {...stylex.props(configurationFieldStyles.error)} role="alert">{error}</p> : null}
    </div>
  )
}

export function ConfigurationFields<T extends object>({
  fields,
  store,
}: {
  fields: readonly ConfigurationField[]
  store: ConfigurationStore<T>
}) {
  const configuration = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return (
    <div {...stylex.props(configurationFieldStyles.list)}>
      {fields.map(field => (
        <FieldControl
          key={field.path}
          field={field}
          store={store}
          value={getConfigurationValue(configuration, field.path)}
        />
      ))}
    </div>
  )
}
