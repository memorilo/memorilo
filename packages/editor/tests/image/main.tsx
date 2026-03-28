import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ImageFixtureApp } from './app'
import '../../dev/src/main.css'
import '../fixture.css'
import './runtime'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <StrictMode>
    <ImageFixtureApp />
  </StrictMode>,
)
