import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'

export function UtilButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'rounded-md bg-background px-3 py-1 hover:bg-secondary disabled:pointer-events-none disabled:text-gray-300',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
