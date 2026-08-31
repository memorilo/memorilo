import { renderToString } from 'react-dom/server'
import { ManagementAppRoot } from './app'

export function render(): string {
  return renderToString(<ManagementAppRoot />)
}
