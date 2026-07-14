/**
 * Example: a runnable Code Mode MCP server for the Swagger Petstore API.
 * Serves MCP over Streamable HTTP at POST /mcp.
 *
 * Run it:
 *   wrangler dev                       # from examples/petstore
 *   npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --method tools/list
 *
 * wrangler.jsonc (alongside) provides the LOADER binding and a self-service
 * binding so `exports.Gate` resolves as the execute isolate's outbound.
 *
 * SECURITY: this /mcp endpoint is UNAUTHENTICATED. Fine for the public demo
 * Petstore. If you set PETSTORE_API_KEY or deploy publicly, put auth in front
 * (OAuth or a bearer check) first, or any caller can spend your key and run
 * unbounded code.
 */
import { exports } from 'cloudflare:workers'
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server'
import {
  createGate,
  processSpec,
  registerCodemodeTools,
  type ToolRegistrar,
  type WorkerLoaderLike,
} from '../../src/index'

interface Env {
  LOADER: WorkerLoaderLike
  /** Optional: injected as the `api_key` header when set. */
  PETSTORE_API_KEY?: string
}

const API_BASE = 'https://petstore3.swagger.io/api/v3'
const SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json'

export const Gate = createGate({ allowedHosts: [new URL(API_BASE).hostname] })

// Fetch + reduce the spec once per isolate rather than on every search call.
let catalog: Promise<unknown> | undefined
function getCatalog(): Promise<unknown> {
  return (catalog ??= fetchCatalog())
}
async function fetchCatalog(): Promise<unknown> {
  return processSpec(
    (await (await fetch(SPEC_URL)).json()) as Record<string, unknown>,
  )
}

function buildServer(env: Env): McpServer {
  const server = new McpServer({ name: 'petstore-codemode', version: '0.1.0' })
  registerCodemodeTools(server as unknown as ToolRegistrar, {
    loader: env.LOADER,
    catalog: {
      get: getCatalog,
      description:
        'Swagger Petstore OpenAPI catalog: spec.paths[path][method].',
    },
    api: {
      baseUrl: API_BASE,
      outbound: () =>
        (exports as Record<string, (options: unknown) => unknown>).Gate?.({
          props: env.PETSTORE_API_KEY
            ? { headers: { api_key: env.PETSTORE_API_KEY } }
            : {},
        }),
      description: 'Swagger Petstore v3.',
    },
    timeoutMs: 10_000,
  })
  return server
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname !== '/mcp') {
      return new Response(
        'Petstore Code Mode MCP server. POST JSON-RPC to /mcp.',
        { status: 404 },
      )
    }

    // Stateless Streamable HTTP: a fresh server + transport per request.
    const server = buildServer(env)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    ctx.waitUntil(transport.close())
    return response
  },
}
