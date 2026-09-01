import type { DesktopTodoTaskStatus } from '@memorilo/desktop-api'
import type { LucideIcon } from 'lucide-react'
import { Circle, CircleCheck, CircleDotDashed } from 'lucide-react'

export const todoTaskStatusIcons: Readonly<Record<DesktopTodoTaskStatus, LucideIcon>> = {
  doing: CircleDotDashed,
  done: CircleCheck,
  todo: Circle,
}
