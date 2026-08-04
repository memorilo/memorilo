import { Effect } from 'effect'
import { afterEach, expect, it, vi } from 'vitest'

import { fetchShelfPage } from './request'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('treats an Atom link without rel as alternate navigation', async () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Calibre-Web</title>
      <entry>
        <title>Newest Books</title>
        <link href="/opds/new" type="application/atom+xml;profile=opds-catalog" />
      </entry>
    </feed>`
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
    status: 200,
  })))

  const result = await Effect.runPromise(fetchShelfPage({ url: 'https://books.example/opds' }))

  if (result.status !== 'updated')
    throw new TypeError('A fresh OPDS response must return an updated page')
  expect(result.page.publications).toEqual([])
  expect(result.page.navigation).toEqual([{
    href: 'https://books.example/opds/new',
    subtitle: null,
    title: 'Newest Books',
  }])
})

it('prefers an OPDS thumbnail over the full cover image', async () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Books</title>
      <entry>
        <id>urn:book:one</id>
        <title>A Book</title>
        <link rel="http://opds-spec.org/image" href="/covers/full.jpg" type="image/jpeg" />
        <link rel="http://opds-spec.org/image/thumbnail" href="/covers/thumbnail.jpg" type="image/jpeg" />
        <link rel="http://opds-spec.org/acquisition" href="/books/one.epub" type="application/epub+zip" />
      </entry>
    </feed>`
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
    status: 200,
  })))

  const result = await Effect.runPromise(fetchShelfPage({ url: 'https://books.example/opds' }))

  if (result.status !== 'updated')
    throw new TypeError('A fresh OPDS response must return an updated page')
  expect(result.page.publications).toHaveLength(1)
  expect(result.page.publications[0]?.coverUrl).toBe('https://books.example/covers/thumbnail.jpg')
})
