import { beforeEach, describe, expect, it } from 'vitest'
import {
  registerCodemodeTools,
  type RegisteredTool,
  type ToolRegistrar,
} from '../src/tools'
import { LOADER } from './helpers/env'
import { gateCalls, makeGateOutbound } from './fixture/worker'

type ToolCallback = (args: { code: string }) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

function captureRegistrar() {
  const tools = new Map<string, { config: RegisteredTool; cb: ToolCallback }>()
  const server: ToolRegistrar = {
    registerTool(name, config, cb) {
      tools.set(name, {
        config: config as RegisteredTool,
        cb: cb as ToolCallback,
      })
    },
  }
  return { server, tools }
}

function setup(maxResponseTokens?: number) {
  const { server, tools } = captureRegistrar()
  registerCodemodeTools(server, {
    loader: LOADER,
    catalog: {
      get: () => ({ paths: { '/v1/me': { get: { summary: 'Who am I' } } } }),
      description: 'Fake API spec for tests',
    },
    api: {
      baseUrl: 'https://api.fake.test',
      outbound: () => makeGateOutbound('tool-token'),
      description: 'Fake API',
    },
    maxResponseTokens,
  })
  return tools
}

beforeEach(() => {
  gateCalls.length = 0
})

describe('registerCodemodeTools', () => {
  it('registers search and execute with descriptions and schemas', () => {
    const tools = setup()
    expect([...tools.keys()].sort()).toEqual(['execute', 'search'])
    expect(tools.get('search')?.config.description).toContain(
      'Fake API spec for tests',
    )
    expect(tools.get('execute')?.config.description).toContain('api.request(')
  })

  it('search runs code against the baked catalog', async () => {
    const tools = setup()
    const out = await tools
      .get('search')!
      .cb({ code: 'async () => Object.keys(spec.paths)' })
    expect(out.isError).toBeUndefined()
    expect(JSON.parse(out.content[0]!.text)).toEqual(['/v1/me'])
  })

  it('search isolates have no network access', async () => {
    const tools = setup()
    const out = await tools.get('search')!.cb({
      code: 'async () => (await fetch("https://api.fake.test/v1/me")).status',
    })
    expect(out.isError).toBe(true)
    expect(gateCalls).toHaveLength(0)
  })

  it('execute calls the API through the gate with injected credentials', async () => {
    const tools = setup()
    const out = await tools.get('execute')!.cb({
      code: 'async () => api.request({ method: "GET", path: "/v1/me" })',
    })
    expect(out.isError).toBeUndefined()
    expect(gateCalls).toHaveLength(1)
    expect(gateCalls[0]?.authorization).toBe('Bearer tool-token')
    expect(JSON.parse(out.content[0]!.text).data.auth).toBe('Bearer tool-token')
  })

  it('formats isolate errors as tool errors', async () => {
    const tools = setup()
    const out = await tools
      .get('execute')!
      .cb({ code: 'async () => { throw new Error("nope") }' })
    expect(out.isError).toBe(true)
    expect(out.content[0]!.text).toContain('nope')
  })

  it('truncates oversized results to the configured cap', async () => {
    const tools = setup(50)
    const out = await tools
      .get('search')!
      .cb({ code: 'async () => "y".repeat(5000)' })
    expect(out.content[0]!.text).toContain('TRUNCATED')
  })
})
