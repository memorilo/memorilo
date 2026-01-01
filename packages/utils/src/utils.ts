import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { Option, pipe } from 'effect'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const isEmptyObject = (obj: Record<string, any>) => Object.keys(obj).length === 0

export function parsePositiveInt(value: string, fallback: number) {
  return pipe(
    Option.fromNullable(Number.parseInt(value, 10)),
    Option.filter(n => Number.isFinite(n) && n > 0),
    Option.getOrElse(() => Math.max(1, fallback)),
  )
}
