import { Button } from '@memorilo/components/ui/button'
import { Scrollspy } from '@memorilo/components/ui/scrollspy'
import { memorilo } from '@memorilo/core'
import { Console, Effect, Either, Option } from 'effect'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AutoForm } from './auto-form'

export function Settings() {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation('settings')

  const catalogs = useMemo(() => memorilo.settings.getCatalogs().map(key => ({
    key,
    items: memorilo.settings.getCatalogItems(key),
  })), [])

  const defaultValues = useMemo(() => {
    const values: Record<string, any> = {}
    catalogs.forEach((catalog) => {
      catalog.items.forEach((item) => {
        const fullKey = `${catalog.key}::${item.key}`
        const result = memorilo.settings.get(fullKey)
        if (Either.isRight(result) && Option.isSome(result.right)) {
          values[fullKey] = result.right.value
        }
        else {
          values[fullKey] = item.defaultValue
        }
      })
    })
    return values
  }, [catalogs])

  const handleSave = async (values: Record<string, any>) => {
    for (const [key, value] of Object.entries(values)) {
      await Effect.runPromise(Console.info(`Set setting ${key} = ${JSON.stringify(value)}`))
      memorilo.settings.set(key, value)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full min-h-0">
      <aside className="w-full md:w-48 lg:w-64 shrink-0 border-0 md:pr-2 md:border-r">
        <Scrollspy
          offset={20}
          targetRef={parentRef}
          className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 max-w-full"
        >
          {catalogs.map(catalog => (
            <Button
              key={catalog.key}
              variant="ghost"
              className="justify-start w-auto md:w-full whitespace-nowrap data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              data-scrollspy-anchor={catalog.key}
            >
              {t(`${catalog.key}.title`, `${catalog.key}.title`)}
            </Button>
          ))}
        </Scrollspy>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <div ref={parentRef} className="h-full min-h-0 pe-4 overflow-y-auto">
          {
            catalogs.map(catalog => (
              <AutoForm
                key={catalog.key}
                catalog={catalog}
                defaultValues={defaultValues}
                onChange={handleSave}
              />
            ),
            )
          }
        </div>
      </main>
    </div>
  )
}
