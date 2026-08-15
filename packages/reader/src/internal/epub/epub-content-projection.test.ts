import type { ReaderAnnotation } from '../../types'
import { DecorationStyleType } from '@readium/navigator'
import { Link, Links, Locator, LocatorLocations } from '@readium/shared'
import { describe, expect, it } from 'vitest'
import {
  epubOutline,
  readiumDecoration,
  readiumDecorations,
  serializedEpubLocator,
} from './epub-content-projection'

function locator() {
  return new Locator({
    href: 'text/chapter.xhtml',
    locations: new LocatorLocations({ progression: 0.25 }),
    type: 'application/xhtml+xml',
  })
}

describe('epub content projection', () => {
  it('builds stable recursive outline ids and retains the underlying navigation links', () => {
    const child = new Link({
      href: 'text/chapter-2.xhtml',
      title: 'Second',
      type: 'application/xhtml+xml',
    })
    const parent = new Link({
      children: new Links([child]),
      href: 'text/chapter-1.xhtml',
      title: 'First',
      type: 'application/xhtml+xml',
    })
    const outline = epubOutline([parent])

    expect(outline.items).toEqual([{
      children: [{
        children: [],
        href: 'text/chapter-2.xhtml',
        id: 'epub.0.0',
        label: 'Second',
        navigable: true,
      }],
      href: 'text/chapter-1.xhtml',
      id: 'epub.0',
      label: 'First',
      navigable: true,
    }])
    expect(outline.requireTarget('epub.0')).toBe(parent)
    expect(outline.requireTarget('epub.0.0')).toBe(child)
  })

  it('serializes locators and projects text annotations into Readium decorations', () => {
    const serialized = serializedEpubLocator(locator())
    const annotation: ReaderAnnotation = {
      anchors: [{
        format: 'epub',
        locator: serialized,
        quote: { exact: 'Selected text' },
        type: 'text',
      }],
      annotationTopicId: 'topic-1',
      color: 'purple',
      createdAt: 10,
      id: 'annotation-1',
      style: 'underline',
      updatedAt: 20,
    }

    expect(serialized).toMatchObject({
      href: 'text/chapter.xhtml',
      locations: { progression: 0.25 },
      type: 'application/xhtml+xml',
    })
    expect(readiumDecoration(annotation)).toMatchObject({
      id: 'annotation-1',
      style: {
        tint: '#B99BFF',
        type: DecorationStyleType.Underline,
      },
    })
  })

  it('projects every EPUB text anchor while preserving one annotation identity', () => {
    const annotation: ReaderAnnotation = {
      anchors: [
        {
          format: 'epub',
          locator: serializedEpubLocator(locator()),
          quote: { exact: 'First section' },
          type: 'text',
        },
        {
          format: 'epub',
          locator: serializedEpubLocator(new Locator({
            href: 'text/chapter-2.xhtml',
            locations: new LocatorLocations({ progression: 0.5 }),
            type: 'application/xhtml+xml',
          })),
          quote: { exact: 'Second section' },
          type: 'text',
        },
      ],
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-cross-section',
      style: 'highlight',
      updatedAt: 1,
    }

    expect(readiumDecorations(annotation).map(decoration => ({
      href: decoration.locator.href,
      id: decoration.id,
    }))).toEqual([
      { href: 'text/chapter.xhtml', id: 'annotation-cross-section' },
      { href: 'text/chapter-2.xhtml', id: 'annotation-cross-section:1' },
    ])
  })
})
