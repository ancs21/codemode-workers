/**
 * Test fixture worker: exports the Gate entrypoint (so `exports.Gate` resolves
 * as a worker-loader outbound) and a /run endpoint that executes posted agent
 * code in a gated isolate. Tests import `gateCalls` from this module — the
 * pool runs tests in the same isolate, so module state is shared.
 */
import { exports } from 'cloudflare:workers'
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { createGate } from '../../src/gate'
import { runInIsolate, type WorkerLoaderLike } from '../../src/isolate'
import { registerCodemodeTools, type ToolRegistrar } from '../../src/tools'

export const gateCalls: Array<{
	url: string
	authorization: string | null
	redirect: Request['redirect']
}> = []

export const Gate = createGate({
	allowedHosts: ['api.fake.test'],
	// Fake upstream: records what crossed the gate and echoes the auth header.
	fetcher: async (request) => {
		gateCalls.push({
			url: request.url,
			authorization: request.headers.get('Authorization'),
			redirect: request.redirect
		})
		return Response.json({ ok: true, auth: request.headers.get('Authorization') })
	}
})

/** Gate outbound factory for tests: resolves exports.Gate in this module's scope. */
export function makeGateOutbound(token: string): unknown {
	return (exports as Record<string, (options: unknown) => unknown>).Gate?.({
		props: { headers: { Authorization: `Bearer ${token}` } }
	})
}

/** Build an MCP server wired to the fake gate + a static catalog (deterministic). */
function buildMcpServer(env: { LOADER: WorkerLoaderLike }): McpServer {
	const server = new McpServer({ name: 'test-codemode', version: '0.0.0' })
	registerCodemodeTools(server as unknown as ToolRegistrar, {
		loader: env.LOADER,
		catalog: {
			get: () => ({ paths: { '/v1/me': { get: { summary: 'Who am I' } } } }),
			description: 'Test catalog'
		},
		api: {
			baseUrl: 'https://api.fake.test',
			outbound: () => makeGateOutbound('mcp-token'),
			description: 'Fake API'
		}
	})
	return server
}

export default {
	async fetch(
		request: Request,
		env: { LOADER: WorkerLoaderLike },
		ctx: ExecutionContext
	): Promise<Response> {
		const path = new URL(request.url).pathname

		if (path === '/mcp') {
			const server = buildMcpServer(env)
			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true
			})
			await server.connect(transport)
			const response = await transport.handleRequest(request)
			ctx.waitUntil(transport.close())
			return response
		}

		if (path !== '/run') {
			return new Response('mcp-codemode test fixture')
		}
		const { code, token } = (await request.json()) as { code: string; token: string }
		try {
			const result = await runInIsolate(env.LOADER, {
				code,
				outbound: (exports as Record<string, (options: unknown) => unknown>).Gate?.({
					props: { headers: { Authorization: `Bearer ${token}` } }
				})
			})
			return Response.json({ result })
		} catch (error) {
			return Response.json({ err: error instanceof Error ? error.message : String(error) })
		}
	}
}
