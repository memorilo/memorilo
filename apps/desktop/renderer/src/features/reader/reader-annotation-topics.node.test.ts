import type { ReaderAnnotationTopicCreateInput } from '@memorilo/editor/reader'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createReaderAnnotationTopic } from './reader-annotation-topics'

const input: ReaderAnnotationTopicCreateInput = {
  annotation: {
    anchor: {
      end: 20,
      format: 'txt',
      start: 10,
      type: 'region',
    },
    color: 'yellow',
    createdAt: 1,
    id: 'annotation-1',
    style: 'highlight',
    updatedAt: 1,
  },
  clientRect: { height: 60, left: 40, top: 30, width: 120 },
  location: 'Page 1',
}

describe('reader annotation Topic creation', () => {
  it('does not create an orphan Topic when the highlight is deleted during capture', async () => {
    const capture = deferred<Uint8Array>()
    const controller = new AbortController()
    const cancellation = new Error('Highlight deleted while creating its Topic')
    const createTopic = vi.fn(() => 'topic-1')
    const captureReaderRegion = vi.fn(async () => capture.promise)
    const saveImage = vi.fn(async () => ({ src: 'memorilo-asset:///annotation.png' }))
    const creation = createReaderAnnotationTopic({
      bookTopicId: 'book-topic-1',
      captureReaderRegion,
      createTopic,
      input,
      saveImage,
      signal: controller.signal,
      viewport: { height: 900, width: 1440 },
    })

    await vi.waitFor(() => expect(captureReaderRegion).toHaveBeenCalledOnce())
    expect(captureReaderRegion).toHaveBeenCalledWith(
      { height: 60, width: 120, x: 40, y: 30 },
    )
    controller.abort(cancellation)
    capture.resolve(new Uint8Array([137, 80, 78, 71]))

    await expect(creation).rejects.toBe(cancellation)
    expect(saveImage).not.toHaveBeenCalled()
    expect(createTopic).not.toHaveBeenCalled()
  })
})
