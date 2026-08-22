import type { DesktopRequestHandlers } from '../desktop-request-handlers'
import type { NoteApplicationService } from '../notes/note-application-service'
import type { TodoCalendarService } from '../todo/todo-calendar-service'

export function createNoteHandlers(
  application: NoteApplicationService,
  calendars: TodoCalendarService,
): DesktopRequestHandlers['notes'] {
  return {
    createNote(input?: Parameters<NoteApplicationService['createNote']>[0]) {
      return application.createNote(input)
    },
    getNote(input: Parameters<NoteApplicationService['getNote']>[0]) {
      return application.getNote(input)
    },
    getDeleteNoteImpact(input: Parameters<NoteApplicationService['getDeleteNoteImpact']>[0]) {
      return application.getDeleteNoteImpact(input)
    },
    getTopicBlock(input: Parameters<NoteApplicationService['getTopicBlock']>[0]) {
      return application.getTopicBlock(input)
    },
    listNotes(input?: Parameters<NoteApplicationService['listNotes']>[0]) {
      return application.listNotes(input)
    },
    listFavoriteNotes(input?: Parameters<NoteApplicationService['listFavoriteNotes']>[0]) {
      return application.listFavoriteNotes(input)
    },
    listRecentNotes(input?: Parameters<NoteApplicationService['listRecentNotes']>[0]) {
      return application.listRecentNotes(input)
    },
    listTodoTasks(input?: Parameters<NoteApplicationService['listTodoTasks']>[0]) {
      return application.listTodoTasks(input)
    },
    createTodoTask(input: Parameters<NoteApplicationService['createTodoTask']>[0]) {
      return application.createTodoTask(input)
    },
    listTodoCalendarEvents(input: Parameters<TodoCalendarService['listEvents']>[0]) {
      return calendars.listEvents(input)
    },
    listTodoCalendarSubscriptions() {
      return calendars.listSubscriptions()
    },
    refreshTodoCalendar(id: Parameters<TodoCalendarService['refresh']>[0]) {
      return calendars.refresh(id)
    },
    removeTodoCalendar(id: Parameters<TodoCalendarService['remove']>[0]) {
      return calendars.remove(id).then(() => null)
    },
    subscribeTodoCalendar(input: Parameters<TodoCalendarService['subscribe']>[0]) {
      return calendars.subscribe(input)
    },
    updateTodoTask(input: Parameters<NoteApplicationService['updateTodoTask']>[0]) {
      return application.updateTodoTask(input)
    },
    openMostRecentNote() {
      return application.openMostRecentNote()
    },
    renameNote(input: Parameters<NoteApplicationService['renameNote']>[0]) {
      return application.renameNote(input)
    },
    deleteNote(input: Parameters<NoteApplicationService['deleteNote']>[0]) {
      return application.deleteNote(input)
    },
    saveNoteUpdates(input: Parameters<NoteApplicationService['saveNoteUpdates']>[0]) {
      return application.saveNoteUpdates(input)
    },
    searchNotes(input: Parameters<NoteApplicationService['searchNotes']>[0]) {
      return application.searchNotes(input)
    },
    searchTopicBlocks(input: Parameters<NoteApplicationService['searchTopicBlocks']>[0]) {
      return application.searchTopicBlocks(input)
    },
    recordNoteOpened(input: Parameters<NoteApplicationService['recordNoteOpened']>[0]) {
      return application.recordNoteOpened(input).then(() => null)
    },
    setNoteFavorite(input: Parameters<NoteApplicationService['setNoteFavorite']>[0]) {
      return application.setNoteFavorite(input)
    },
  }
}
