import type { DesktopLearningApi } from '@memorilo/desktop-preload'
import type { SingleFlightResult } from '@memorilo/effect-lifecycle'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
} from '@memorilo/effect-lifecycle'

export type FsrsOptimizer = Awaited<ReturnType<DesktopLearningApi['getOptimizer']>>
export type OptimizerConfiguration = FsrsOptimizer['configuration']
export type ConfigurationSource = 'factory' | 'global'

export interface OptimizerRecord {
  noteCount: number
  optimizer: FsrsOptimizer
}

export interface OptimizerDraft {
  configuration: OptimizerConfiguration
  name: string
}

type OptimizerAdapter = Pick<DesktopLearningApi, | 'archiveOptimizer'
  | 'createOptimizer'
  | 'getOptimizerNoteCount'
  | 'listOptimizers'
  | 'optimizeOptimizer'
  | 'resetOptimizerDefaults'
  | 'saveOptimizer'>

const stepPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?[mhd]$/u

export class LearningOptimizerWorkflow {
  readonly #adapter: OptimizerAdapter
  readonly #operations = createOperationSupervisor('Learning optimizer workflow', {
    concurrency: 'unbounded',
  })

  constructor(adapter: OptimizerAdapter) {
    this.#adapter = adapter
  }

  readonly archive = (optimizerId: string): Promise<SingleFlightResult<void>> => (
    this.#operations.runSingleFlight(() => this.#adapter.archiveOptimizer(optimizerId))
  )

  readonly close = (): Promise<void> => this.#operations.close()

  readonly configurationChanged = (draft: OptimizerDraft, optimizer: FsrsOptimizer): boolean => (
    JSON.stringify(draft.configuration) !== JSON.stringify(optimizer.configuration)
  )

  readonly create = (
    name: string,
    source: ConfigurationSource,
    globalConfiguration: OptimizerConfiguration,
  ): Promise<SingleFlightResult<FsrsOptimizer>> => {
    const normalizedName = name.trim()
    if (normalizedName.length === 0)
      return Promise.reject(new TypeError('FSRS Optimizer name must not be empty'))
    return this.#operations.runSingleFlight(() => this.#adapter.createOptimizer({
      ...(source === 'global'
        ? { configuration: structuredClone(globalConfiguration) }
        : {}),
      name: normalizedName,
    }))
  }

  readonly draft = (optimizer: FsrsOptimizer): OptimizerDraft => ({
    configuration: optimizer.configuration,
    name: optimizer.name,
  })

  readonly load = (): Promise<readonly OptimizerRecord[]> => this.#operations.run(async () => {
    const optimizers = (await this.#adapter.listOptimizers())
      .filter(optimizer => optimizer.status === 'active')
    const outcomes = await Promise.allSettled(optimizers.map(async optimizer => ({
      noteCount: await this.#adapter.getOptimizerNoteCount(optimizer.id),
      optimizer,
    })))
    const failures: unknown[] = []
    const records: OptimizerRecord[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled')
        records.push(outcome.value)
      else
        failures.push(outcome.reason)
    }
    if (failures.length > 0)
      throw combineLifecycleFailures(failures, 'Failed to load FSRS Optimizer Note counts')
    return records
  })

  readonly optimize = (
    optimizerId: string,
    rescheduleNow: boolean,
  ): Promise<SingleFlightResult<FsrsOptimizer>> => this.#operations.runSingleFlight(() => (
    this.#adapter.optimizeOptimizer({ optimizerId, rescheduleNow })
  ))

  readonly parseConfigurationSource = (value: string): ConfigurationSource => {
    if (value === 'factory' || value === 'global')
      return value
    throw new TypeError(`Unknown optimizer configuration source: ${value}`)
  }

  readonly parseSteps = (value: string): readonly string[] => {
    const steps = value.split(',').map(step => step.trim()).filter(step => step.length > 0)
    if (steps.some(step => !stepPattern.test(step)))
      throw new TypeError('Invalid learning steps')
    return steps
  }

  readonly reset = (
    optimizerId: string,
    rescheduleNow: boolean,
  ): Promise<SingleFlightResult<FsrsOptimizer>> => this.#operations.runSingleFlight(() => (
    this.#adapter.resetOptimizerDefaults(optimizerId, rescheduleNow)
  ))

  readonly save = (
    optimizer: FsrsOptimizer,
    draft: OptimizerDraft,
    rescheduleNow: boolean,
  ): Promise<SingleFlightResult<FsrsOptimizer>> => this.#operations.runSingleFlight(() => (
    this.#adapter.saveOptimizer({
      configuration: draft.configuration,
      name: optimizer.isGlobal ? optimizer.name : draft.name.trim(),
      optimizerId: optimizer.id,
      rescheduleNow,
    })
  ))
}
