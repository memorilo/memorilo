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
      :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      html, body { height: 100%; margin: 0; }
      body { align-items: center; background: #fff; color: #171a18; display: flex; justify-content: center; }
      main { max-width: 28rem; padding: 2rem; text-align: center; }
      h1 { font-size: 1.25rem; letter-spacing: 0; margin: 0 0 .5rem; }
      p { color: #66706a; font-size: .95rem; line-height: 1.5; margin: 0; }
      @media (prefers-color-scheme: dark) {
        body { background: #171a18; color: #f7f8f6; }
        p { color: #b5bdb8; }
      }
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
