'use dom'

import { useEffect } from 'react'

interface MobileAssetSourceRewriterProps {
  resolveAsset: (source: string) => Promise<string>
}

export function MobileAssetSourceRewriter({ resolveAsset }: MobileAssetSourceRewriterProps) {
  useEffect(() => {
    let active = true
    const pending = new Map<HTMLImageElement, string>()
    const rewrite = (image: HTMLImageElement): void => {
      const source = image.getAttribute('src')
      if (!source?.startsWith('memorilo://asset/'))
        return
      if (pending.get(image) === source)
        return
      pending.set(image, source)
      void resolveAsset(source).then((resolved) => {
        if (active && image.getAttribute('src') === source)
          image.setAttribute('src', resolved)
      }).finally(() => {
        if (pending.get(image) === source)
          pending.delete(image)
      })
    }
    const scan = (root: ParentNode): void => {
      if (root instanceof HTMLImageElement)
        rewrite(root)
      root.querySelectorAll('img').forEach(rewrite)
    }
    scan(document)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement)
          rewrite(mutation.target)
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element)
            scan(node)
        })
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['src'],
      childList: true,
      subtree: true,
    })
    return () => {
      active = false
      observer.disconnect()
      pending.clear()
    }
  }, [resolveAsset])
  return null
}
