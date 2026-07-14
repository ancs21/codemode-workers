import { describe, expect, it } from 'vitest'
import { processSpec, resolveRefs } from '../src/catalog'

describe('resolveRefs', () => {
	it('inlines $ref pointers from the spec', () => {
		const spec = {
			components: { schemas: { Thing: { type: 'object' } } }
		}
		const resolved = resolveRefs({ $ref: '#/components/schemas/Thing' }, spec)
		expect(resolved).toEqual({ type: 'object' })
	})

	it('resolves nested refs inside arrays and objects', () => {
		const spec = { defs: { A: { title: 'a' } } }
		const resolved = resolveRefs({ items: [{ $ref: '#/defs/A' }], plain: 1 }, spec)
		expect(resolved).toEqual({ items: [{ title: 'a' }], plain: 1 })
	})

	it('marks circular refs instead of recursing forever', () => {
		const spec: Record<string, unknown> = {}
		spec.defs = { Loop: { next: { $ref: '#/defs/Loop' } } }
		const resolved = resolveRefs({ $ref: '#/defs/Loop' }, spec) as { next: unknown }
		expect(resolved.next).toEqual({ $circular: '#/defs/Loop' })
	})
})

describe('processSpec', () => {
	it('keeps only the agent-relevant operation fields, refs resolved', () => {
		const spec = {
			components: { schemas: { Body: { type: 'object', required: ['name'] } } },
			paths: {
				'/widgets': {
					post: {
						summary: 'Create widget',
						operationId: 'ignored',
						requestBody: { $ref: '#/components/schemas/Body' },
						responses: { '200': { description: 'ok' } }
					}
				}
			}
		}
		const processed = processSpec(spec)
		const op = processed.paths['/widgets']?.post as Record<string, unknown>
		expect(op.summary).toBe('Create widget')
		expect(op.requestBody).toEqual({ type: 'object', required: ['name'] })
		expect(op).not.toHaveProperty('operationId')
	})

	it('ignores non-HTTP-method keys on path items', () => {
		const processed = processSpec({
			paths: { '/a': { get: { summary: 's' }, parameters: [{ name: 'shared' }] } }
		})
		expect(Object.keys(processed.paths['/a'] ?? {})).toEqual(['get'])
	})

	it('handles an empty spec', () => {
		expect(processSpec({}).paths).toEqual({})
	})
})
