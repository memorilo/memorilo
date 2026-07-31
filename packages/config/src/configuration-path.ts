function pathSegments(path: string): readonly string[] {
  if (path.length === 0)
    throw new TypeError('Configuration path must not be empty')
  return path.split('.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getConfigurationValue(configuration: object, path: string): unknown {
  let current: unknown = configuration
  for (const segment of pathSegments(path)) {
    if (!isRecord(current) || !(segment in current))
      throw new TypeError(`Configuration path does not exist: ${path}`)
    current = current[segment]
  }
  return current
}

export function setConfigurationValue(configuration: object, path: string, value: unknown): object {
  const segments = pathSegments(path)
  const root = { ...configuration } as Record<string, unknown>
  let source: unknown = configuration
  let target = root

  segments.forEach((segment, index) => {
    if (!isRecord(source) || !(segment in source))
      throw new TypeError(`Configuration path does not exist: ${path}`)
    if (index === segments.length - 1) {
      target[segment] = value
      return
    }

    const sourceChild = source[segment]
    if (!isRecord(sourceChild))
      throw new TypeError(`Configuration path does not address an object: ${path}`)
    const targetChild = { ...sourceChild }
    target[segment] = targetChild
    source = sourceChild
    target = targetChild
  })

  return root
}
