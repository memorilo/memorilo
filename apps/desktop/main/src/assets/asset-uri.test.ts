import { describe, expect, it } from 'vitest'

import { parseAssetFileName } from './asset-uri'

const fileName = '123e4567-e89b-42d3-a456-426614174000.png'

describe('asset URI parser', () => {
  it.each([
    [`memorilo-asset:///${fileName}`, fileName],
    [`memorilo-asset://${fileName}/`, fileName],
    ['memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.%70ng', fileName],
  ])('accepts a managed asset URI %s', (uri, expected) => {
    expect(parseAssetFileName(uri)).toBe(expected)
  })

  it.each([
    `https://example.com/${fileName}`,
    `memorilo-asset:///${fileName}?version=1`,
    `memorilo-asset:///${fileName}#preview`,
    `memorilo-asset://${fileName}/nested`,
    'memorilo-asset:///../outside.png',
    'memorilo-asset:///%E0%A4%A',
    'memorilo-asset:///not-a-uuid.png',
  ])('rejects a noncanonical or unsafe URI %s', (uri) => {
    expect(parseAssetFileName(uri)).toBeNull()
  })
})
