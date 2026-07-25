import { atom } from 'jotai'

export type UploadStatus = 'idle' | 'uploading'

export const uploadStatusAtom = atom<UploadStatus>('idle')
export const uploadErrorAtom = atom<string | null>(null)
