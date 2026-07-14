/**
 * Example: a runnable Code Mode MCP server for the Urantia Papers API
 * (https://api.urantia.dev). Serves MCP over Streamable HTTP at POST /mcp.
 *
 * Most endpoints are public (/toc, /papers, /paragraphs/{ref}, POST /search,
 * /entities/{id}); the /me/* endpoints need a bearer token, so the gate injects
 * Authorization only when URANTIA_TOKEN is set.
 *
 * Run it:
 *   wrangler dev                       # from examples/urantia
 *   npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --method tools/list
 *
 * wrangler.jsonc (alongside) provides the LOADER binding and a self-service
 * binding so `exports.Gate` resolves as the execute isolate's outbound.
 *
 * SECURITY: this /mcp endpoint is UNAUTHENTICATED. That is fine for the public,
 * read-only Urantia endpoints. But if you set URANTIA_TOKEN, or deploy this
 * publicly, you MUST put auth in front (OAuth or a bearer check) first —
 * otherwise any caller can invoke /me/* as your token's user (confused deputy)
 * and run unbounded code. See the reference cloudflare-mcp for the OAuth setup.
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
  /** Optional: only needed to call the /me/* endpoints. Public reads work without it. */
  URANTIA_TOKEN?: string
}

const API_BASE = 'https://api.urantia.dev'
const SPEC_URL = 'https://api.urantia.dev/openapi.json'

export const Gate = createGate({ allowedHosts: [new URL(API_BASE).hostname] })

// Fetch + reduce the spec once per isolate rather than on every search call.
// ponytail: isolate-lifetime memo, no TTL. Add a timed cache if the spec
// starts changing and you need same-day freshness.
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
  const server = new McpServer({ name: 'urantia-codemode', version: '0.1.0' })
  // registerCodemodeTools only needs registerTool(name, config, cb); the real
  // McpServer method is generically typed, so adapt it at this boundary.
  registerCodemodeTools(server as unknown as ToolRegistrar, {
    loader: env.LOADER,
    catalog: {
      get: getCatalog,
      description:
        'Urantia Papers API. spec.paths[path][method]. Public reads: /toc, /papers, /paragraphs/{ref}, POST /search, /entities/{id}. Auth-only: /me/*.',
    },
    api: {
      baseUrl: API_BASE,
      outbound: () =>
        (exports as Record<string, (options: unknown) => unknown>).Gate?.({
          props: env.URANTIA_TOKEN
            ? { headers: { Authorization: `Bearer ${env.URANTIA_TOKEN}` } }
            : {},
        }),
      description:
        'Urantia Papers API v1. Most endpoints are public; /me/* needs a bearer token.',
    },
    // Bound agent execution so a runaway `while(true)` can't hang the endpoint.
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
        'Urantia Code Mode MCP server. POST JSON-RPC to /mcp.',
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
