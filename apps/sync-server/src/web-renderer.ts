export interface SyncServerWebRenderer {
  readonly render: () => string
}

export async function loadSyncServerWebRenderer(moduleUrl: URL): Promise<SyncServerWebRenderer> {
  const loaded = await import(moduleUrl.href) as { readonly render?: unknown }
  if (typeof loaded.render !== 'function')
    throw new TypeError('Sync server SSR artifact does not export render()')
  return { render: loaded.render as () => string }
}
