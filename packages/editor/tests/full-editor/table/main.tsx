import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TableFixtureApp } from '../../table/app'
import '../../../dev/src/main.css'
import '../../fixture.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <StrictMode>
    <TableFixtureApp environment="full" />
  </StrictMode>,
)
