import { describe, expect, it } from 'vitest'
import { compareFootprint, nativeToolsFromSpec } from '../src/eval'
import type { ProcessedSpec } from '../src/catalog'
import type { ToolShape } from '../src/eval'

const spec: ProcessedSpec = {
	paths: {
		'/widgets': {
			get: {
				summary: 'List widgets',
				parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }]
			},
			post: {
				summary: 'Create widget',
				parameters: [],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									description: { type: 'string', maxLength: 500 }
								},
								required: ['name']
							}
						}
					}
				}
			}
		},
		'/widgets/{id}': {
			get: {
				summary: 'Get widget',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
			}
		}
	}
}

describe('nativeToolsFromSpec', () => {
	it('produces one tool per path+method', () => {
		const tools = nativeToolsFromSpec(spec)
		expect(tools).toHaveLength(3)
		expect(tools.map((t) => t.name).sort()).toEqual([
			'get_widgets',
			'get_widgets_id',
			'post_widgets'
		])
	})

	it('carries the summary as the description', () => {
		const post = nativeToolsFromSpec(spec).find((t) => t.name === 'post_widgets')
		expect(post?.description).toBe('Create widget')
	})

	it('full schema includes the request body properties', () => {
		const post = nativeToolsFromSpec(spec).find((t) => t.name === 'post_widgets')
		expect(JSON.stringify(post?.inputSchema)).toContain('maxLength')
	})

	it('minimal schema drops the request body and optional params', () => {
		const postMin = nativeToolsFromSpec(spec, { minimal: true }).find(
			(t) => t.name === 'post_widgets'
		)
		expect(JSON.stringify(postMin?.inputSchema)).not.toContain('maxLength')
		const getMin = nativeToolsFromSpec(spec, { minimal: true }).find((t) => t.name === 'get_widgets')
		// `limit` is optional, so it is absent from the minimal schema
		expect(JSON.stringify(getMin?.inputSchema)).not.toContain('limit')
	})
})

describe('compareFootprint', () => {
	const codeModeTools: ToolShape[] = [
		{ name: 'search', description: 'find endpoints', inputSchema: { type: 'object' } },
		{ name: 'execute', description: 'call the api', inputSchema: { type: 'object' } }
	]

	it('reports endpoint count and a ratio above 1', () => {
		const r = compareFootprint(codeModeTools, spec)
		expect(r.endpointCount).toBe(3)
		expect(r.nativeTokens).toBeGreaterThan(r.codeModeTokens)
		expect(r.ratio).toBeGreaterThan(1)
	})

	it('minimal baseline is smaller than full', () => {
		const full = compareFootprint(codeModeTools, spec).nativeTokens
		const minimal = compareFootprint(codeModeTools, spec, { minimal: true }).nativeTokens
		expect(minimal).toBeLessThan(full)
	})
})
