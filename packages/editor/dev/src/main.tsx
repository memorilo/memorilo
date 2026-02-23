import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Doc } from 'yjs'
import { App } from './app'
import './main.css'

const doc = new Doc()
const fragment = doc.getXmlFragment('doc')

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <StrictMode>
    <App fragment={fragment} />
  </StrictMode>,
)
