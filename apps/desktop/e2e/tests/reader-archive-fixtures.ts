import { Buffer } from 'node:buffer'

interface StoredZipEntry {
  data: Buffer | string
  name: string
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) === 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of data)
    crc = crcTable[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function storedZip(entries: readonly StoredZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data
    const checksum = crc32(data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034B50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.byteLength, 18)
    localHeader.writeUInt32LE(data.byteLength, 22)
    localHeader.writeUInt16LE(name.byteLength, 26)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014B50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.byteLength, 20)
    centralHeader.writeUInt32LE(data.byteLength, 24)
    centralHeader.writeUInt16LE(name.byteLength, 28)
    centralHeader.writeUInt32LE(localOffset, 42)

    localParts.push(localHeader, name, data)
    centralParts.push(centralHeader, name)
    localOffset += localHeader.byteLength + name.byteLength + data.byteLength
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.byteLength, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

export function lifecycleEpub(): Buffer {
  return storedZip([
    { data: 'application/epub+zip', name: 'mimetype' },
    {
      data: `<?xml version="1.0" encoding="UTF-8"?>
        <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
          <rootfiles>
            <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`,
      name: 'META-INF/container.xml',
    },
    {
      data: `<?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:identifier id="book-id">urn:memorilo:e2e:lifecycle</dc:identifier>
            <dc:title>Lifecycle EPUB</dc:title>
            <dc:language>en</dc:language>
          </metadata>
          <manifest>
            <item href="chapter.xhtml" id="chapter" media-type="application/xhtml+xml" />
          </manifest>
          <spine><itemref idref="chapter" /></spine>
        </package>`,
      name: 'OPS/package.opf',
    },
    {
      data: `<?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <head><title>Lifecycle chapter</title></head>
          <body><h1>EPUB lifecycle fixture</h1><p>Rendered archive content.</p></body>
        </html>`,
      name: 'OPS/chapter.xhtml',
    },
  ])
}

export function lifecycleCbz(): Buffer {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=',
    'base64',
  )
  return storedZip([{ data: pixel, name: '001.png' }])
}
