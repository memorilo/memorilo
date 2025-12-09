import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const isEmptyObject = (obj: Record<string, any>) => Object.keys(obj).length === 0
