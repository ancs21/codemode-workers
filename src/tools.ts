import { z } from 'zod'
import { runInIsolate, type WorkerLoaderLike } from './isolate'
import { truncateResponse } from './truncate'

/** Structural slice of an MCP server — works with any SDK exposing registerTool. */
export interface ToolRegistrar {
	registerTool(name: string, config: RegisteredTool, callback: (args: { code: string }) => unknown): unknown
}

export interface RegisteredTool {
	title: string
	description: string
	inputSchema: unknown
	annotations: { title: string; readOnlyHint?: boolean }
}

export interface CodemodeConfig {
	loader: WorkerLoaderLike
	catalog: {
		/** The catalog object baked into every search isolate. */
		get: () => unknown | Promise<unknown>
		/** Global name the code sees. Default: 'spec'. */
		globalName?: string
		/** Appended to the search tool description (shape docs, examples). */
		description?: string
	}
	api: {
		/** Base URL prepended to api.request paths, e.g. https://api.example.com/v4 */
		baseUrl: string
		/** Factory for the gate outbound, called per execute invocation (e.g. () => exports.Gate({ props })). */
		outbound: () => unknown
		/** Appended to the execute tool description. */
		description?: string
		/** Extra values baked into execute isolates (e.g. { accountId }). */
		globals?: Record<string, unknown>
	}
	maxResponseTokens?: number
}

/** The api.request() helper compiled into every execute isolate. */
function apiPrelude(baseUrl: string): string {
	return `const api = {
	async request({ method, path, query, body, contentType, rawBody }) {
		const url = new URL(${JSON.stringify(baseUrl)} + path);
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
		}
		const headers = {};
		if (contentType) headers["Content-Type"] = contentType;
		else if (body && !rawBody) headers["Content-Type"] = "application/json";
		const response = await fetch(url.toString(), {
			method,
			headers,
			body: rawBody ? body : body ? JSON.stringify(body) : undefined
		});
		const responseType = response.headers.get("content-type") || "";
		const data = responseType.includes("application/json") ? await response.json() : await response.text();
		if (!response.ok) {
			throw new Error("API error " + response.status + ": " + (typeof data === "string" ? data : JSON.stringify(data)));
		}
		return { status: response.status, data };
	}
};`
}

function toolResult(value: unknown, maxTokens?: number) {
	return { content: [{ type: 'text' as const, text: truncateResponse(value, { maxTokens }) }] }
}

function toolError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const }
}

const CODE_INPUT = z.object({
	code: z.string().describe('JavaScript async arrow function to run')
})

/** Run an isolate call and shape it as an MCP tool result, or a tool error. */
async function runTool(run: () => Promise<unknown>, maxTokens?: number) {
	try {
		return toolResult(await run(), maxTokens)
	} catch (error) {
		return toolError(error)
	}
}

/**
 * Register Code Mode tools on an MCP server: `search` (read-only code over the
 * catalog, no network) and `execute` (code calling api.request() through the
 * credential-injecting gate).
 */
export function registerCodemodeTools(server: ToolRegistrar, config: CodemodeConfig): void {
	const { loader, catalog, api, maxResponseTokens } = config
	const globalName = catalog.globalName ?? 'spec'

	server.registerTool(
		'search',
		{
			title: 'API Catalog Search',
			description: `Search the API catalog. Write an async arrow function over the \`${globalName}\` global and return what you find. No network access.\n\n${catalog.description ?? ''}\n\nExample:\nasync () => Object.entries(${globalName}.paths).filter(([p]) => p.includes("widget"))`,
			inputSchema: CODE_INPUT,
			annotations: { title: 'API Catalog Search', readOnlyHint: true }
		},
		({ code }) =>
			runTool(
				async () =>
					runInIsolate(loader, {
						code,
						globals: { [globalName]: await catalog.get() },
						idPrefix: 'codemode-search'
					}),
				maxResponseTokens
			)
	)

	server.registerTool(
		'execute',
		{
			title: 'API Code Executor',
			description: `Execute JavaScript against the API. Use the search tool first to find endpoints, then call api.request({ method, path, query, body, contentType, rawBody }).\n\n${api.description ?? ''}\n\nExample:\nasync () => api.request({ method: "GET", path: "/v1/things" })`,
			inputSchema: CODE_INPUT,
			annotations: { title: 'API Code Executor' }
		},
		({ code }) =>
			runTool(
				() =>
					runInIsolate(loader, {
						code,
						prelude: apiPrelude(api.baseUrl),
						globals: api.globals,
						outbound: api.outbound(),
						idPrefix: 'codemode-execute'
					}),
				maxResponseTokens
			)
	)
}
