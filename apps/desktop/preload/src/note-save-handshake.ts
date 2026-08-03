export const noteSaveRequestChannel = 'memorilo:note-save-request'
export const noteSaveResultChannel = 'memorilo:note-save-result'

export interface NoteSaveRequest {
  requestId: string
}

export type NoteSaveResult = {
  requestId: string
  status: 'saved'
} | {
  message: string
  requestId: string
  status: 'failed'
}
