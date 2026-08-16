import type { DesktopLearningApi } from '@memorilo/desktop-api'
import type { FsrsOptimizer } from './learning-optimizer-workflow'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { LearningOptimizerWorkflow } from './learning-optimizer-workflow'

function optimizer(overrides: Partial<FsrsOptimizer> = {}): FsrsOptimizer {
  return {
    configuration: { desiredRetention: 0.9 } as FsrsOptimizer['configuration'],
    createdAt: 1,
    id: 'optimizer',
    isGlobal: false,
    name: 'Original',
    revisionId: 'revision-1',
    status: 'active',
    updatedAt: 1,
    ...overrides,
  }
}

function adapter(overrides: Partial<DesktopLearningApi> = {}) {
  return {
    archiveOptimizer: vi.fn(async () => undefined),
    createOptimizer: vi.fn(async () => optimizer()),
    getOptimizerNoteCount: vi.fn(async () => 0),
    listOptimizers: vi.fn(async () => [optimizer()]),
    optimizeOptimizer: vi.fn(async () => optimizer()),
    resetOptimizerDefaults: vi.fn(async () => optimizer()),
    saveOptimizer: vi.fn(async () => optimizer()),
    ...overrides,
  }
}

describe('learning optimizer workflow', () => {
  it('loads only active optimizers together with their Note counts', async () => {
    const active = optimizer()
    const archived = optimizer({ id: 'archived', status: 'archived' })
    const learning = adapter({
      getOptimizerNoteCount: vi.fn(async id => id === active.id ? 3 : 0),
      listOptimizers: vi.fn(async () => [active, archived]),
    })
    const workflow = new LearningOptimizerWorkflow(learning)

    await expect(workflow.load()).resolves.toEqual([{ noteCount: 3, optimizer: active }])
    expect(learning.getOptimizerNoteCount).toHaveBeenCalledWith(active.id)
    expect(learning.getOptimizerNoteCount).not.toHaveBeenCalledWith(archived.id)
    await workflow.close()
  })

  it('normalizes one atomic save command for name and configuration changes', async () => {
    const learning = adapter()
    const workflow = new LearningOptimizerWorkflow(learning)
    const current = optimizer()
    const configuration = { desiredRetention: 0.94 } as FsrsOptimizer['configuration']

    await expect(workflow.save(current, {
      configuration,
      name: '  Renamed  ',
    }, true)).resolves.toMatchObject({ status: 'accepted' })

    expect(learning.saveOptimizer).toHaveBeenCalledOnce()
    expect(learning.saveOptimizer).toHaveBeenCalledWith({
      configuration,
      name: 'Renamed',
      optimizerId: current.id,
      rescheduleNow: true,
    })
    await workflow.close()
  })

  it('stops read admission immediately while draining accepted reads and mutations', async () => {
    const pendingRead = deferred<FsrsOptimizer[]>()
    const pendingMutation = deferred<FsrsOptimizer>()
    const learning = adapter({
      listOptimizers: vi.fn(() => pendingRead.promise),
      saveOptimizer: vi.fn(() => pendingMutation.promise),
    })
    const workflow = new LearningOptimizerWorkflow(learning)
    const current = optimizer()
    const load = workflow.load()
    const save = workflow.save(current, workflow.draft(current), false)

    const closing = workflow.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    const lateRead = workflow.load().then(
      () => 'accepted' as const,
      error => error,
    )
    const lateAdmission = await Promise.race([
      lateRead,
      new Promise<'still-pending'>(resolve => setTimeout(() => resolve('still-pending'), 0)),
    ])

    expect(lateAdmission).toBeInstanceOf(Error)
    expect(closed).toBe(false)

    pendingMutation.resolve(current)
    await save
    await Promise.resolve()
    expect(closed).toBe(false)

    pendingRead.resolve([])
    await load
    await lateRead
    await closing
    expect(closed).toBe(true)
  })

  it('keeps a failed load owned until every parallel Note count settles', async () => {
    const pendingCount = deferred<number>()
    const countFailure = new Error('count unavailable')
    const second = optimizer({ id: 'optimizer-2' })
    const getOptimizerNoteCount = vi.fn((optimizerId: string) => (
      optimizerId === second.id ? pendingCount.promise : Promise.reject(countFailure)
    ))
    const workflow = new LearningOptimizerWorkflow(adapter({
      getOptimizerNoteCount,
      listOptimizers: vi.fn(async () => [optimizer(), second]),
    }))
    const load = workflow.load().then(
      value => ({ status: 'loaded' as const, value }),
      error => ({ error, status: 'failed' as const }),
    )

    await vi.waitFor(() => expect(getOptimizerNoteCount).toHaveBeenCalledTimes(2))
    const closing = workflow.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(closed).toBe(false)
    pendingCount.resolve(2)
    await expect(load).resolves.toEqual({ error: countFailure, status: 'failed' })
    await closing
  })

  it('rejects overlapping mutations, admits a retry after failure, and rejects mutations after close', async () => {
    const pending = deferred<FsrsOptimizer>()
    const saveOptimizer = vi.fn(() => pending.promise)
    const learning = adapter({ saveOptimizer })
    const workflow = new LearningOptimizerWorkflow(learning)
    const current = optimizer()
    const draft = workflow.draft(current)

    const first = workflow.save(current, draft, false)
    await expect(workflow.archive(current.id)).resolves.toEqual({ status: 'busy' })
    expect(learning.archiveOptimizer).not.toHaveBeenCalled()

    pending.resolve(current)
    await expect(first).resolves.toEqual({ status: 'accepted', value: current })

    saveOptimizer.mockRejectedValueOnce(new Error('save conflict'))
    await expect(workflow.save(current, draft, false)).rejects.toThrow('save conflict')
    saveOptimizer.mockResolvedValueOnce(current)
    await expect(workflow.save(current, draft, false)).resolves.toMatchObject({ status: 'accepted' })

    await workflow.close()
    await expect(workflow.archive(current.id)).rejects.toThrow('Learning optimizer workflow is closed')
  })
})
