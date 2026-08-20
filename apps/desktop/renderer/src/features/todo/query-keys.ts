export const todoQueryKeys = {
  all: ['todo-tasks'] as const,
  calendars: ['todo-calendars'] as const,
  list: (status: string) => ['todo-tasks', 'list', status] as const,
}
