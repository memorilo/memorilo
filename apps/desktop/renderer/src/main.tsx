import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { router } from './router'
import './styles/app.css'

const rootElement = document.querySelector('#root')

if (!rootElement)
  throw new Error('Missing renderer root element')

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
