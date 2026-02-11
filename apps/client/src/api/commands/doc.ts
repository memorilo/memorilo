import type { EffectDocCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectDocCommands: EffectDocCommands = {
  getDoc: wrapCommand('getDoc'),
  getDocTitle: wrapCommand('getDocTitle'),
  getDocVersion: wrapCommand('getDocVersion'),
  updateDoc: wrapCommand('updateDoc'),
  updateTopicDoc: wrapCommand('updateTopicDoc'),
  createDoc: wrapCommand('createDoc'),
  updateDocTitle: wrapCommand('updateDocTitle'),
  deleteDoc: wrapCommand('deleteDoc'),
  createTopic: wrapCommand('createTopic'),
  watchDoc: wrapCommand('watchDoc'),
  unwatchDoc: wrapCommand('unwatchDoc'),
}
