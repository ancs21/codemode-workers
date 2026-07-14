/**
 * Example: a Code Mode MCP worker for the Swagger Petstore API.
 *
 * Wiring shown here:
 *  - Gate: re-exported entrypoint, allowlisting the API host, injecting the key
 *  - Catalog: OpenAPI spec fetched and processed on demand (cache as you like)
 *  - Tools: registerCodemodeTools onto your MCP SDK server
 *
 * wrangler.jsonc needs:
 *  "worker_loaders": [{ "binding": "LOADER" }],
 *  "services": [{ "binding": "GATE_SELF", "service": "<worker-name>", "entrypoint": "Gate" }]
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
	PETSTORE_API_KEY: string
}

const API_BASE = 'https://petstore3.swagger.io/api/v3'
const SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json'

export const Gate = createGate({ allowedHosts: [new URL(API_BASE).hostname] })

async function fetchCatalog(): Promise<unknown> {
	const response = await fetch(SPEC_URL)
	return processSpec((await response.json()) as Record<string, unknown>)
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Build your MCP server with the SDK of your choice
		// (e.g. new McpServer(...) from @modelcontextprotocol/server),
		// then hand it to registerCodemodeTools — it only needs registerTool().
		const server: ToolRegistrar = {
			registerTool() {
				/* your MCP SDK provides this */
			}
		}

		registerCodemodeTools(server, {
			loader: env.LOADER,
			catalog: {
				get: fetchCatalog,
				description: 'Swagger Petstore OpenAPI catalog: spec.paths[path][method].'
			},
			api: {
				baseUrl: API_BASE,
				outbound: () =>
					(exports as Record<string, (options: unknown) => unknown>).Gate?.({
						props: { headers: { api_key: env.PETSTORE_API_KEY } }
					}),
				description: 'Swagger Petstore v3.'
			}
		})

		// ...then serve MCP over HTTP with your SDK's transport.
		return new Response('petstore codemode example', { status: 200 })
	}
}
