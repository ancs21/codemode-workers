import { describe, expect, it } from 'vitest'
import { runInIsolate, withTimeout } from '../src/isolate'
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

	it('honors timeoutMs for code that runs longer than the budget', async () => {
		await expect(
			runInIsolate(LOADER, {
				code: 'async () => { await new Promise((r) => setTimeout(r, 5000)); return 1 }',
				timeoutMs: 100
			})
		).rejects.toThrow(/timed out/i)
	})

	it('does not time out fast code when a timeout is set', async () => {
		const result = await runInIsolate(LOADER, { code: 'async () => 7', timeoutMs: 1000 })
		expect(result).toBe(7)
	})
})

describe('withTimeout', () => {
	it('rejects a promise that does not settle in time', async () => {
		await expect(withTimeout(new Promise(() => {}), 50)).rejects.toThrow(/timed out after 50ms/)
	})

	it('resolves a promise that settles in time', async () => {
		await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42)
	})

	it('propagates the underlying rejection unchanged', async () => {
		await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
	})
})
