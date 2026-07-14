const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/**
 * Resolve `$ref` pointers inline so agent code never has to chase references.
 * Circular references become `{ $circular: <ref> }` markers.
 */
export function resolveRefs(
	value: unknown,
	spec: Record<string, unknown>,
	seen = new Set<string>()
): unknown {
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map((item) => resolveRefs(item, spec, seen))

	const record = value as Record<string, unknown>

	if (typeof record.$ref === 'string') {
		const ref = record.$ref
		if (seen.has(ref)) return { $circular: ref }
		seen.add(ref)

		let resolved: unknown = spec
		for (const part of ref.replace('#/', '').split('/')) {
			resolved = (resolved as Record<string, unknown> | undefined)?.[part]
		}
		return resolveRefs(resolved, spec, seen)
	}

	const result: Record<string, unknown> = {}
	for (const [key, entry] of Object.entries(record)) {
		result[key] = resolveRefs(entry, spec, seen)
	}
	return result
}

interface OperationObject {
	summary?: string
	description?: string
	tags?: string[]
	parameters?: unknown
	requestBody?: unknown
	responses?: unknown
}

export interface ProcessedSpec {
	paths: Record<string, Record<string, unknown>>
}

/**
 * Reduce a raw OpenAPI spec to the searchable catalog baked into search
 * isolates: per path/method, only the fields an agent needs to pick and call
 * an endpoint, with all $refs resolved inline.
 */
export function processSpec(spec: Record<string, unknown>): ProcessedSpec {
	const rawPaths = (spec.paths ?? {}) as Record<string, Record<string, OperationObject>>
	const paths: ProcessedSpec['paths'] = {}

	for (const [path, pathItem] of Object.entries(rawPaths)) {
		if (!pathItem) continue
		paths[path] = {}

		for (const method of HTTP_METHODS) {
			const op = pathItem[method]
			if (!op) continue
			paths[path][method] = {
				summary: op.summary,
				description: op.description,
				tags: op.tags,
				parameters: resolveRefs(op.parameters, spec),
				requestBody: resolveRefs(op.requestBody, spec),
				responses: resolveRefs(op.responses, spec)
			}
		}
	}

	return { paths }
}
