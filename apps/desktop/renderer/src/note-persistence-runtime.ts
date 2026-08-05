import { createContext } from 'react'
import { createNotePersistenceManager } from './note-persistence-manager'

export const notePersistenceManager = createNotePersistenceManager({
  adapter: window.desktop,
})

export const NotePersistenceContext = createContext(notePersistenceManager)
