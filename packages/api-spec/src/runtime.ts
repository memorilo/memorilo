import type { Effect } from 'effect'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import type * as RuntimeTypes from 'effect/Runtime'
import * as Runtime from 'effect/Runtime'
import { initEq } from './query'

let managedRuntime: ManagedRuntime.ManagedRuntime<any, never> | null = null
let runtime: RuntimeTypes.Runtime<any> | null = null

function getRuntime(): RuntimeTypes.Runtime<any> {
  if (!runtime) {
    const current = getManagedRuntime()
    runtime = current.runSync(current.runtimeEffect)
  }
  return runtime
}

export function setManagedRuntime(next: ManagedRuntime.ManagedRuntime<any, never>) {
  managedRuntime = next
  runtime = null
  initEq(next)
}

export function getManagedRuntime(): ManagedRuntime.ManagedRuntime<any, never> {
  if (!managedRuntime) {
    throw new Error('API runtime is not initialized. Call setManagedRuntime() before using services.')
  }
  return managedRuntime
}

export function runPromise<A, E>(effect: Effect.Effect<A, E, any>) {
  return Runtime.runPromise(getRuntime())(effect)
}

export function runSync<A, E>(effect: Effect.Effect<A, E, any>) {
  return Runtime.runSync(getRuntime())(effect)
}

export function runFork<A, E>(effect: Effect.Effect<A, E, any>) {
  return Runtime.runFork(getRuntime())(effect)
}

export function getService<T>(tag: Effect.Effect<T, any, any>): T {
  return runSync(tag)
}
