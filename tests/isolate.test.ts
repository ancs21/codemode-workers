import { describe, expect, it } from 'vitest'
import { runInIsolate } from '../src/isolate'
import { LOADER } from './helpers/env'

describe('runInIsolate (real Worker Loader)', () => {
	it('runs agent code and returns its result', async () => {
		const result = await runInIsolate(LOADER, { code: 'async () => 1 + 1' })
		expect(result).toBe(2)
	})

	it('exposes baked globals to the code', async () => {
		const result = await runInIsolate(LOADER, {
			code: 'async () => Object.keys(spec.paths)',
			globals: { spec: { paths: { '/zones': {}, '/accounts': {} } } }
		})
		expect(result).toEqual(['/zones', '/accounts'])
	})

	it('surfaces errors thrown inside the isolate', async () => {
		await expect(
			runInIsolate(LOADER, { code: 'async () => { throw new Error("boom") }' })
		).rejects.toThrow('boom')
	})

	it('blocks network access by default (no outbound)', async () => {
		await expect(
			runInIsolate(LOADER, { code: 'async () => (await fetch("https://example.com")).status' })
		).rejects.toThrow()
	})

	it('runs prelude helpers', async () => {
		const result = await runInIsolate(LOADER, {
			code: 'async () => double(21)',
			prelude: 'const double = (n) => n * 2;'
		})
		expect(result).toBe(42)
	})
})
