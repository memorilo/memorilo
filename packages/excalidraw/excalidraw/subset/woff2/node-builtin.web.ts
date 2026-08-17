export function loadNodeBuiltin(moduleName: 'fs' | 'path'): never {
  throw new Error(`Node builtin ${moduleName} is unavailable in a browser`)
}
