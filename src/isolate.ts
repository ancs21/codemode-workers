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
	/**
	 * Reject the call if evaluate() has not settled within this many ms. Default:
	 * no timeout (the platform's CPU limit is the only backstop). Set this to bound
	 * agent code that never settles (e.g. `new Promise(() => {})`).
	 */
	timeoutMs?: number
}

const DEFAULT_COMPATIBILITY_DATE = '2026-01-12'

/** Reject with a timeout error if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Execution timed out after ${ms}ms`)), ms)
		promise.then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error: unknown) => {
				clearTimeout(timer)
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		)
	})
}

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
		timeoutMs,
		...sourceOptions
	} = options

	const worker = loader.get(`${idPrefix}-${crypto.randomUUID()}`, () => ({
		compatibilityDate,
		globalOutbound: outbound,
		mainModule: 'worker.js',
		modules: { 'worker.js': buildModuleSource(sourceOptions) }
	}))

	const entrypoint = worker.getEntrypoint() as IsolateEntrypoint
	const evaluation = entrypoint.evaluate()
	const response = timeoutMs === undefined ? await evaluation : await withTimeout(evaluation, timeoutMs)

	if (response.err) {
		throw new Error(response.err)
	}
	return response.result
}
