import { describe, expect, it } from 'vitest'
import { buildModuleSource } from '../src/module-source'

describe('buildModuleSource', () => {
	it('bakes globals in as JSON constants', () => {
		const src = buildModuleSource({
			code: 'async () => spec.paths',
			globals: { spec: { paths: { '/a': {} } } }
		})
		expect(src).toContain('const spec = {"paths":{"/a":{}}};')
	})

	it('invokes the user code as a compiled expression, not eval', () => {
		const src = buildModuleSource({ code: 'async () => 42' })
		expect(src).toContain('await (async () => 42)()')
		expect(src).not.toMatch(/\beval\s*\(/)
		expect(src).not.toContain('new Function')
	})

	it('emits a WorkerEntrypoint module with an evaluate method', () => {
		const src = buildModuleSource({ code: 'async () => 1' })
		expect(src).toContain('import { WorkerEntrypoint } from "cloudflare:workers"')
		expect(src).toContain('async evaluate()')
		expect(src).toContain('export default class')
	})

	it('places raw prelude source before the entrypoint class', () => {
		const src = buildModuleSource({
			code: 'async () => api.base',
			prelude: 'const api = { base: "https://x.test" };'
		})
		expect(src.indexOf('const api')).toBeGreaterThan(-1)
		expect(src.indexOf('const api')).toBeLessThan(src.indexOf('export default class'))
	})

	it('preserves backticks and ${} in user code as data', () => {
		const code = 'async () => `path/${accountId}`'
		const src = buildModuleSource({ code, globals: { accountId: 'abc' } })
		expect(src).toContain('await (async () => `path/${accountId}`)()')
	})

	it('rejects global names that are not valid identifiers', () => {
		expect(() => buildModuleSource({ code: 'async () => 1', globals: { 'a b': 1 } })).toThrow(
			/identifier/
		)
	})
})
