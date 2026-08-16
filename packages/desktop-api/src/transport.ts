export const memoriloProtocol = 'memorilo'
export const memoriloAppHost = 'app'
export const memoriloApiHost = 'api'
export const memoriloAssetHost = 'asset'

export const memoriloAppOrigin = `${memoriloProtocol}://${memoriloAppHost}`
export const memoriloApiOrigin = `${memoriloProtocol}://${memoriloApiHost}`
export const memoriloAssetOrigin = `${memoriloProtocol}://${memoriloAssetHost}`

export interface DesktopFetchRequest {
  body: string | null
  headers: readonly (readonly [string, string])[]
  method: string
  url: string
}

export interface DesktopFetchResponse {
  body: string
  headers: readonly (readonly [string, string])[]
  status: number
  statusText: string
}

export type DesktopFetchTransport = (request: DesktopFetchRequest) => Promise<DesktopFetchResponse>

export function createDesktopTransportFetch(transport: DesktopFetchTransport): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const headers: [string, string][] = []
    request.headers.forEach((value, name) => headers.push([name, value]))
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? null
      : await request.text()
    const response = await transport({
      body,
      headers,
      method: request.method,
      url: request.url,
    })
    return new Response(response.body, {
      headers: response.headers.map(([name, value]): [string, string] => [name, value]),
      status: response.status,
      statusText: response.statusText,
    })
  }
}
