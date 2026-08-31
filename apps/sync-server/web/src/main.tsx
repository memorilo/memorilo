import { createRoot, hydrateRoot } from 'react-dom/client'
import { ManagementAppRoot } from './app'

const container = document.getElementById('root')
if (!container)
  throw new Error('Sync server management root is missing')

if (container.hasChildNodes())
  hydrateRoot(container, <ManagementAppRoot />)
else
  createRoot(container).render(<ManagementAppRoot />)
