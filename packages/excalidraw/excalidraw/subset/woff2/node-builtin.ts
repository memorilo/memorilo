declare const require: (moduleName: string) => unknown

export function loadNodeBuiltin(moduleName: 'fs' | 'path'): unknown {
  return require([moduleName].join())
}
