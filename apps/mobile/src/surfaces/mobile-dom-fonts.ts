import type { EditorFontFaceAsset } from '@memorilo/editor/dom-assets'
import { editorFontFaceAssets } from '@memorilo/editor/dom-assets'

let loading: Promise<void> | null = null

function loadFont(font: EditorFontFaceAsset): Promise<void> {
  const face = new FontFace(font.family, `url(${JSON.stringify(font.source)}) format("woff2")`, {
    display: font.display,
    style: font.style ?? 'normal',
    weight: font.weight ?? 'normal',
  })
  return face.load().then((loaded) => {
    document.fonts.add(loaded)
  })
}

export function loadMobileDomFonts(): Promise<void> {
  if (!loading) {
    loading = Promise.all(editorFontFaceAssets.map(loadFont))
      .then(() => undefined)
      .catch((error: unknown) => {
        loading = null
        throw error
      })
  }
  return loading
}
