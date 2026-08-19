import type { MobileSurfaceKind } from './bridge-contract'
import { mobileSurfaceBridgeVersion } from './bridge-contract'

const labels: Record<MobileSurfaceKind, string> = {
  card: 'Card review',
  editor: 'Editor',
  reader: 'Reader',
}

export function createSurfaceDocument(surface: MobileSurfaceKind): string {
  const label = labels[surface]
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      html, body { height: 100%; margin: 0; }
      body { align-items: center; background: #FFFFFF; color: rgba(25, 27, 31, 0.9); display: flex; justify-content: center; }
      main { max-width: 28rem; padding: 2rem; text-align: center; }
      h1 { font-size: 1.25rem; letter-spacing: 0; margin: 0 0 .5rem; }
      p { color: rgba(48, 46, 51, 0.62); font-size: .95rem; line-height: 1.5; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>${label}</h1>
      <p>Waiting for a local document.</p>
    </main>
    <script>
      window.ReactNativeWebView.postMessage(JSON.stringify({
        surface: '${surface}',
        type: 'surface.ready',
        version: ${mobileSurfaceBridgeVersion}
      }))
    </script>
  </body>
</html>`
}
