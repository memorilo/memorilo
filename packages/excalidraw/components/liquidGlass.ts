const LIQUID_GLASS_SELECTORS = [
  '.Island:not(.App-toolbar):not(.App-menu__left):not(.App-bottom-bar-layout)',
  '.dropdown-menu:not(.dropdown-menu--mobile) .dropdown-menu-container',
  '.context-menu',
  '.Modal__content',
  '.popover',
  '.sidebar',
  '.color-picker',
].join(',')

interface DisplacementOptions {
  width: number
  height: number
  radius: number
  depth: number
  strength: number
}

function encodeSvg(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function getDisplacementMap({
  width,
  height,
  radius,
  depth,
}: Omit<DisplacementOptions, 'strength'>) {
  return encodeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="y" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#00ff00" />
        <stop offset="1" stop-color="#000000" />
      </linearGradient>
      <linearGradient id="x" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#ff0000" />
        <stop offset="1" stop-color="#000000" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#808080" />
    <g filter="blur(2px)">
      <rect width="${width}" height="${height}" fill="#000080" />
      <rect width="${width}" height="${height}" fill="url(#y)" opacity=".72" />
      <rect width="${width}" height="${height}" fill="url(#x)" opacity=".72" />
      <rect x="${depth}" y="${depth}" width="${Math.max(1, width - depth * 2)}" height="${Math.max(1, height - depth * 2)}" rx="${radius}" fill="#808080" />
    </g>
  </svg>`)
}

function getDisplacementFilter(options: DisplacementOptions) {
  const { width, height, strength } = options
  const map = getDisplacementMap(options)
  return `${encodeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <filter id="displace" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feImage href="${map}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${strength}" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>`)}#displace`
}

function getRadius(element: HTMLElement) {
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
  return Number.isFinite(radius) ? radius : 0
}

function supportsLiquidGlass() {
  if (
    !('CSS' in window)
    || !CSS.supports(
      'backdrop-filter',
      'url("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E#x")',
    )
  ) {
    return false
  }
  return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
}

function updateSurface(element: HTMLElement) {
  const { width, height } = element.getBoundingClientRect()
  if (width < 1 || height < 1) {
    return
  }

  const radius = getRadius(element)
  const shortestSide = Math.min(width, height)
  const depth = Math.min(14, Math.max(4, Math.round(shortestSide * 0.16)))
  const strength = Math.min(22, Math.max(8, Math.round(shortestSide * 0.2)))
  const filter = getDisplacementFilter({
    width: Math.round(width),
    height: Math.round(height),
    radius,
    depth,
    strength,
  })
  element.style.setProperty('--glass-edge-filter', `url("${filter}")`)
}

/** Installs per-surface Liquid Glass lensing for Excalidraw's chrome. */
export function installLiquidGlass(root: HTMLElement) {
  if (!supportsLiquidGlass() || typeof ResizeObserver === 'undefined') {
    return () => undefined
  }

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      updateSurface(entry.target as HTMLElement)
    }
  })

  const updateAll = () => {
    document.querySelectorAll<HTMLElement>(LIQUID_GLASS_SELECTORS).forEach(
      (element) => {
        if (
          root.contains(element)
          || element.closest('.excalidraw-modal-container')
        ) {
          resizeObserver.observe(element)
          updateSurface(element)
        }
      },
    )
  }

  updateAll()
  const mutationObserver = new MutationObserver(updateAll)
  mutationObserver.observe(document.body, { childList: true, subtree: true })

  return () => {
    mutationObserver.disconnect()
    resizeObserver.disconnect()
  }
}
