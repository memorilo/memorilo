import type { MobileSurfaceKind, SurfaceToHostMessage } from './bridge-contract'
import { useMemo } from 'react'
import { WebView } from 'react-native-webview'
import { parseSurfaceToHostMessage } from './bridge-contract'
import { createSurfaceDocument } from './surface-document'

export interface SurfaceWebViewProps {
  onMessage: (message: SurfaceToHostMessage) => void
  surface: MobileSurfaceKind
}

export function SurfaceWebView({ onMessage, surface }: SurfaceWebViewProps) {
  const source = useMemo(() => ({ html: createSurfaceDocument(surface) }), [surface])
  return (
    <WebView
      allowFileAccess
      javaScriptEnabled
      onMessage={event => onMessage(parseSurfaceToHostMessage(event.nativeEvent.data))}
      originWhitelist={['file://', 'about:blank']}
      source={source}
    />
  )
}
