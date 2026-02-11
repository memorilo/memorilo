import { useAssetUrl } from '@memorilo/api-spec/query'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { Console, Effect } from 'effect'
import { isEmpty } from 'es-toolkit/compat'
import { isString } from 'es-toolkit/predicate'
import { useRef, useState } from 'react'
import { LuImage, LuImageOff } from 'react-icons/lu'

const FALLBACK_PLACEHOLDER_WIDTH = 320
const FALLBACK_PLACEHOLDER_HEIGHT = 180

interface ImageContentProps {
  assetId: string | null
  uploadId: string | null
  uploadError: string | null
  src: string | null
  alt: string | null
  explicitSize: boolean
  baseImgClassName: string | undefined
}

export function ImageContent(props: ImageContentProps) {
  const { assetId, uploadId, uploadError, src, alt, explicitSize, baseImgClassName } = props

  const assetQuery = useAssetUrl(assetId, null)
  const assetUrl = isString(assetQuery.data) ? assetQuery.data : null

  // Display priority:
  // 1) `assetId` -> resolve to a local asset URL (preferred)
  // 2) if resolving fails and `src` exists -> render `src` (used for "downloadImage=false" / legacy data)
  // 3) otherwise -> placeholder / loading / error states
  const candidate = assetId
    ? (assetUrl ?? (assetQuery.isError ? src : null))
    : src

  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [errorSrc, setErrorSrc] = useState<string | null>(null)
  const lastErrorKeyRef = useRef('')

  const isLoaded = !isEmpty(candidate) && loadedSrc === candidate
  const isErrored = !isEmpty(candidate) && errorSrc === candidate && !isLoaded

  const showEmpty = isEmpty(candidate) && isEmpty(assetId) && isEmpty(src) && isEmpty(uploadId) && isEmpty(uploadError)
  const showError = !isEmpty(uploadError)
    || isErrored
    || (!isEmpty(assetId) && assetQuery.isError && !src)
  const showSkeleton = (!isEmpty(uploadId) && isEmpty(candidate))
    || (!isEmpty(assetId) && assetQuery.isPending && isEmpty(candidate))
    || (!isEmpty(candidate) && !isLoaded && !isErrored)

  const fallbackStyle = explicitSize
    ? undefined
    : { width: FALLBACK_PLACEHOLDER_WIDTH, height: FALLBACK_PLACEHOLDER_HEIGHT }

  const containerClassName = explicitSize ? 'relative w-full h-full' : 'relative inline-block max-w-full'

  const imgClassName = explicitSize
    ? `block w-full h-full object-contain ${baseImgClassName ?? ''} ${isLoaded ? '' : 'opacity-0'}`
    : isLoaded
      ? `block max-w-full h-auto ${baseImgClassName ?? ''}`
      : `absolute inset-0 block w-full h-full object-contain opacity-0 ${baseImgClassName ?? ''}`

  if (showEmpty) {
    return (
      <div className={containerClassName}>
        <div
          className={explicitSize
            ? 'absolute inset-0 flex items-center justify-center rounded-md bg-accent text-muted-foreground'
            : 'flex items-center justify-center rounded-md bg-accent text-muted-foreground'}
          style={fallbackStyle}
        >
          <LuImage className="size-8" />
        </div>
      </div>
    )
  }

  if (showError) {
    return (
      <div className={containerClassName}>
        <div
          className={explicitSize
            ? 'absolute inset-0 flex items-center justify-center rounded-md bg-accent text-muted-foreground'
            : 'flex items-center justify-center rounded-md bg-accent text-muted-foreground'}
          style={fallbackStyle}
        >
          <LuImageOff className="size-8" />
        </div>
      </div>
    )
  }

  return (
    <div className={containerClassName}>
      {showSkeleton
        ? (
            <Skeleton
              className={explicitSize ? 'absolute inset-0' : ''}
              style={fallbackStyle}
            />
          )
        : null}

      {candidate
        ? (
            <img
              key={candidate}
              src={candidate}
              alt={alt ?? ''}
              className={imgClassName}
              onLoad={() => setLoadedSrc(candidate)}
              onError={() => {
                const errKey = `${assetId ?? 'none'}|${candidate}`
                if (lastErrorKeyRef.current !== errKey) {
                  lastErrorKeyRef.current = errKey
                  Effect.runPromise(Console.warn(`[image] load failed assetId=${assetId ?? 'none'} src=${candidate}`))
                }
                setErrorSrc(candidate)
              }}
            />
          )
        : null}
    </div>
  )
}
