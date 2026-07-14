import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

interface RpcResponse {
  result?: {
    tools?: Array<{ name: string }>
    content?: Array<{ type: string; text: string }>
  }
  error?: { message: string }
}

/** POST a JSON-RPC message to the fixture's /mcp endpoint, parsing JSON or an SSE frame. */
async function rpc(body: unknown): Promise<RpcResponse> {
  const res = await SELF.fetch('https://fixture.test/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'))
    return JSON.parse(line!.slice('data:'.length).trim())
  }
  return JSON.parse(text)
}

describe('MCP over Streamable HTTP', () => {
  it('tools/list returns search and execute', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(r.result?.tools?.map((t) => t.name).sort()).toEqual([
      'execute',
      'search',
    ])
  })

  it('tools/call search runs code over the baked catalog', async () => {
    const r = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { code: 'async () => Object.keys(spec.paths)' },
      },
    })
    expect(JSON.parse(r.result!.content![0]!.text)).toEqual(['/v1/me'])
  })

  it('tools/call execute reaches the API through the gate with injected creds', async () => {
    const r = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'execute',
        arguments: {
          code: 'async () => api.request({ method: "GET", path: "/v1/me" })',
        },
      },
    })
    const payload = JSON.parse(r.result!.content![0]!.text)
    expect(payload.status).toBe(200)
    expect(payload.data.auth).toBe('Bearer mcp-token')
  })
})
