import { toastEvent } from '@memorilo/api-spec/services/toast'
import { Match } from 'effect'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'

export function RemoteToast() {
  const { t } = useTranslation()
  useEffect(() => {
    const unlisten = toastEvent.listen((e) => {
      const playload = e.payload
      Match.value(playload.toast_type).pipe(
        Match.when('Info', () => {
          toast.info(t(playload.i18n_key as any, {
            ns: playload.ns as any,
            ...playload.values,
          }))
        }),
        Match.when('Success', () => {
          toast.success(t(playload.i18n_key as any, {
            ns: playload.ns as any,
            ...playload.values,
          }))
        }),
        Match.when('Warning', () => {
          toast.warn(t(playload.i18n_key as any, {
            ns: playload.ns as any,
            ...playload.values,
          }))
        }),
        Match.when('Error', () => {
          toast.error(t(playload.i18n_key as any, {
            ns: playload.ns as any,
            ...playload.values,
          }))
        }),
      )
    })
    return () => {
      unlisten.then(f => f())
    }
  }, [t])

  return null
}
