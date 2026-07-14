import { WorkerEntrypoint } from 'cloudflare:workers'

/** Per-call props for a gate instance. Secrets live HERE, never in the isolate. */
export interface GateProps {
	/** Headers injected into every outbound request (e.g. Authorization). */
	headers?: Record<string, string>
}

export interface GateConfig {
	/** Exact hostnames the isolate may reach. Everything else gets a 403. */
	allowedHosts: string[]
	/** Outbound transport. Defaults to global fetch; injectable for tests/retry wrappers. */
	fetcher?: (request: Request) => Promise<Response>
}

/** True when the request URL's hostname is exactly one of the allowed hosts. */
export function checkHost(url: string, allowedHosts: string[]): boolean {
	return allowedHosts.includes(new URL(url).hostname)
}

/**
 * Create the egress gate for `execute` isolates: a WorkerEntrypoint class the
 * consumer re-exports from their worker entry module and passes to
 * `runInIsolate` as `outbound: exports.MyGate({ props })`.
 *
 * The isolate's only network exit routes through `fetch` below, which
 * allowlists the host and injects credential headers from props — so agent
 * code can neither read the secret nor reach any other host.
 */
export function createGate(config: GateConfig) {
	const { allowedHosts, fetcher = (request: Request) => fetch(request) } = config

	return class Gate extends WorkerEntrypoint {
		override async fetch(request: Request): Promise<Response> {
			if (!checkHost(request.url, allowedHosts)) {
				const { hostname } = new URL(request.url)
				return new Response(`Forbidden: requests to ${hostname} are not allowed`, { status: 403 })
			}

			const props = (this.ctx as unknown as { props?: GateProps }).props
			const headers = new Headers(request.headers)
			for (const [name, value] of Object.entries(props?.headers ?? {})) {
				headers.set(name, value)
			}
			return fetcher(new Request(request, { headers }))
		}
	}
}
