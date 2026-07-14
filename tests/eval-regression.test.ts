import { describe, expect, it } from 'vitest'
import { compareFootprint, type ToolShape } from '../src/eval'
import { registerCodemodeTools, type ToolRegistrar } from '../src/tools'
import type { WorkerLoaderLike } from '../src/isolate'
import type { ProcessedSpec } from '../src/catalog'

/** Capture the real code-mode tool descriptions as measurable shapes. */
function codeModeTools(): ToolShape[] {
  const captured = new Map<string, string>()
  const server: ToolRegistrar = {
    registerTool(name, config) {
      captured.set(name, config.description)
      return undefined
    },
  }
  registerCodemodeTools(server, {
    loader: {} as WorkerLoaderLike,
    catalog: { get: () => ({}), description: 'Fixture catalog' },
    api: {
      baseUrl: 'https://api.fixture.test',
      outbound: () => ({}),
      description: 'Fixture API',
    },
  })
  const inputSchema = {
    type: 'object',
    properties: { code: { type: 'string' } },
    required: ['code'],
  }
  return [...captured].map(([name, description]) => ({
    name,
    description,
    inputSchema,
  }))
}

/** A synthetic spec with `n` endpoints, each carrying a modest request body. */
function specWith(n: number): ProcessedSpec {
  const paths: ProcessedSpec['paths'] = {}
  for (let i = 0; i < n; i++) {
    paths[`/resource${i}`] = {
      post: {
        summary: `Create resource ${i}`,
        parameters: [
          {
            name: 'account_id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  config: {
                    type: 'object',
                    properties: {
                      a: { type: 'string' },
                      b: { type: 'number' },
                    },
                  },
                },
                required: ['name'],
              },
            },
          },
        },
      },
    }
  }
  return { paths }
}

describe('token-footprint regression guard', () => {
  const tools = codeModeTools()
  const spec = specWith(50)

  it('code-mode footprint stays small (guards description bloat)', () => {
    expect(compareFootprint(tools, spec).codeModeTokens).toBeLessThan(500)
  })

  it('code mode is at least 5x cheaper than the native baseline', () => {
    expect(compareFootprint(tools, spec).ratio).toBeGreaterThan(5)
  })
})
