/**
 * Example: a Code Mode MCP worker for the Urantia Papers API
 * (https://api.urantia.dev — an AI-agent-friendly API over 17,000+ paragraphs).
 *
 * Most endpoints are public (/toc, /papers, /paragraphs/{ref}, POST /search,
 * POST /search/semantic, /entities/{id}); the /me/* endpoints need a bearer
 * token. So the gate injects Authorization only when URANTIA_TOKEN is set —
 * the public endpoints work with no secret at all.
 *
 * wrangler.jsonc (see alongside this file) needs the LOADER binding and a
 * self-service binding so `exports.Gate` resolves as a worker-loader outbound.
 */
import { exports } from 'cloudflare:workers'
import {
	createGate,
	processSpec,
	registerCodemodeTools,
	type ToolRegistrar,
	type WorkerLoaderLike
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
// ponytail: isolate-lifetime memo, no TTL. The Urantia spec is small and
// static; add a timed cache (see cloudflare-mcp's isolate-cache) if the spec
// starts changing and you need same-day freshness.
let catalog: Promise<unknown> | undefined
function getCatalog(): Promise<unknown> {
	return (catalog ??= fetchCatalog())
}
async function fetchCatalog(): Promise<unknown> {
	const response = await fetch(SPEC_URL)
	return processSpec((await response.json()) as Record<string, unknown>)
}

export default {
	async fetch(_request: Request, env: Env): Promise<Response> {
		// Build your MCP server with the SDK of your choice (e.g. new McpServer(...)
		// from @modelcontextprotocol/server), then hand it to registerCodemodeTools —
		// it only needs registerTool().
		const server: ToolRegistrar = {
			registerTool() {
				/* your MCP SDK provides this */
			}
		}

		registerCodemodeTools(server, {
			loader: env.LOADER,
			catalog: {
				get: getCatalog,
				description:
					'Urantia Papers API. spec.paths[path][method]. Public reads: /toc, /papers, /paragraphs/{ref}, POST /search, POST /search/semantic, /entities/{id}. Auth-only: /me/*.'
			},
			api: {
				baseUrl: API_BASE,
				outbound: () =>
					(exports as Record<string, (options: unknown) => unknown>).Gate?.({
						// Public endpoints need no auth; the token only matters for /me/*.
						props: env.URANTIA_TOKEN
							? { headers: { Authorization: `Bearer ${env.URANTIA_TOKEN}` } }
							: {}
					}),
				description: 'Urantia Papers API v1. Most endpoints are public; /me/* needs a bearer token.'
			}
		})

		// ...then serve MCP over HTTP with your SDK's transport.
		return new Response('urantia codemode example', { status: 200 })
	}
}
