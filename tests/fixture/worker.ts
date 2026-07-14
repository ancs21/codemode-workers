/**
 * Test fixture worker: exports the Gate entrypoint (so `exports.Gate` resolves
 * as a worker-loader outbound) and a /run endpoint that executes posted agent
 * code in a gated isolate. Tests import `gateCalls` from this module — the
 * pool runs tests in the same isolate, so module state is shared.
 */
import { exports } from 'cloudflare:workers'
import { createGate } from '../../src/gate'
import { runInIsolate, type WorkerLoaderLike } from '../../src/isolate'

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

export default {
	async fetch(request: Request, env: { LOADER: WorkerLoaderLike }): Promise<Response> {
		if (new URL(request.url).pathname !== '/run') {
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
