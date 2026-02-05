import { GripVerticalIcon } from '@memorilo/components/ui/animated-icons/grip-vertical'
import { cn } from '@memorilo/utils'
import { useTranslation } from 'react-i18next'
import { MdChevronRight } from 'react-icons/md'

interface OutlineItemControlsProps {
  hovered: boolean
  hasChildren: boolean
  isFolded: boolean
  onToggle: (event: React.MouseEvent) => void
  onGripMouseDown: (event: React.MouseEvent) => void
}

export function OutlineItemControls({
  hovered,
  hasChildren,
  isFolded,
  onToggle,
  onGripMouseDown,
}: OutlineItemControlsProps) {
  const { t } = useTranslation('app')
  return (
    <>
      <button
        type="button"
        onMouseDown={onGripMouseDown}
        onClick={e => e.preventDefault()}
        className={cn(
          'absolute -left-5 top-0.5 w-5 h-5 z-10 flex items-center justify-center rounded cursor-grab active:cursor-grabbing border-none bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700',
          'transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-label={t('editor.outline.drag_item')}
      >
        <GripVerticalIcon size={14} className="text-gray-600 dark:text-gray-400" />
      </button>
      {hasChildren
        ? (
            <button
              type="button"
              onMouseDown={onToggle}
              onClick={e => e.preventDefault()}
              className={cn(
                'absolute left-0 top-0.5 w-5 h-5 z-10 flex items-center justify-center rounded cursor-pointer border-none bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-opacity duration-150',
                hovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <MdChevronRight
                className={cn(
                  'w-4 h-4 text-gray-600 dark:text-gray-400',
                  'transition-transform duration-200',
                  !isFolded && 'rotate-90',
                )}
              />
            </button>
          )
        : null}
    </>
  )
}
