import { buildModuleSource, type ModuleSourceOptions } from './module-source'

/** Result shape marshalled back from the isolate's evaluate(). */
interface EvaluateResult {
	result: unknown
	err?: string
	stack?: string
}

interface IsolateEntrypoint {
	evaluate(): Promise<EvaluateResult>
}

/** Structural type for the Worker Loader binding (`worker_loaders` in wrangler config). */
export interface WorkerLoaderLike {
	get(
		id: string,
		factory: () => {
			compatibilityDate: string
			mainModule: string
			modules: Record<string, string>
			globalOutbound?: unknown
		}
	): { getEntrypoint(): unknown }
}

export interface RunOptions extends ModuleSourceOptions {
	/**
	 * Outbound fetch handler for the isolate. Defaults to null: no network.
	 * Pass a service-binding entrypoint (e.g. `exports.MyGate({ props })`) to
	 * allow gated egress.
	 */
	outbound?: unknown
	compatibilityDate?: string
	/** Prefix for the throwaway worker id, for log readability. */
	idPrefix?: string
}

const DEFAULT_COMPATIBILITY_DATE = '2026-01-12'

/**
 * Run agent code in a fresh dynamic-worker isolate and return its result.
 *
 * A new isolate per call (random id), code compiled into the module source,
 * network closed unless an outbound is provided.
 */
export async function runInIsolate(loader: WorkerLoaderLike, options: RunOptions): Promise<unknown> {
	const {
		outbound = null,
		compatibilityDate = DEFAULT_COMPATIBILITY_DATE,
		idPrefix = 'codemode',
		...sourceOptions
	} = options

	const worker = loader.get(`${idPrefix}-${crypto.randomUUID()}`, () => ({
		compatibilityDate,
		globalOutbound: outbound,
		mainModule: 'worker.js',
		modules: { 'worker.js': buildModuleSource(sourceOptions) }
	}))

	const entrypoint = worker.getEntrypoint() as IsolateEntrypoint
	const response = await entrypoint.evaluate()

	if (response.err) {
		throw new Error(response.err)
	}
	return response.result
}
