const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export interface ModuleSourceOptions {
	/** Agent-written async arrow function source, e.g. `async () => spec.paths` */
	code: string
	/** Values baked into the module as `const <name> = <JSON>;` */
	globals?: Record<string, unknown>
	/** Raw source emitted before the entrypoint class (helpers, throwing getters, pre-serialized JSON) */
	prelude?: string
}

/**
 * Build the source of a dynamic-worker module that runs agent code.
 *
 * The code and its inputs are compiled into the module text; dynamic-worker
 * isolates disallow eval, so this is the only way in — and it means a fresh
 * isolate per call by construction.
 */
export function buildModuleSource(options: ModuleSourceOptions): string {
	const { code, globals = {}, prelude = '' } = options

	const constants = Object.entries(globals)
		.map(([name, value]) => {
			if (!IDENTIFIER.test(name)) {
				throw new Error(`Global name ${JSON.stringify(name)} is not a valid identifier`)
			}
			return `const ${name} = ${JSON.stringify(value)};`
		})
		.join('\n')

	return `import { WorkerEntrypoint } from "cloudflare:workers";
${prelude}
${constants}
export default class Executor extends WorkerEntrypoint {
	async evaluate() {
		try {
			const result = await (${code})();
			return { result, err: undefined };
		} catch (err) {
			return {
				result: undefined,
				err: err && err.message ? String(err.message) : String(err),
				stack: err && err.stack ? String(err.stack) : undefined
			};
		}
	}
}
`
}
