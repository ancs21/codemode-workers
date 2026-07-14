import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkHost, isSecureScheme } from '../src/gate'
import { gateCalls } from './fixture/worker'

/** POST agent code to the fixture worker, which runs it in a gated isolate. */
async function runGated(code: string, token: string): Promise<{ result?: unknown; err?: string }> {
	const response = await SELF.fetch('https://fixture.test/run', {
		method: 'POST',
		body: JSON.stringify({ code, token })
	})
	return response.json()
}

beforeEach(() => {
	gateCalls.length = 0
})

describe('checkHost', () => {
	it('allows exact hostname matches', () => {
		expect(checkHost('https://api.fake.test/v1/things', ['api.fake.test'])).toBe(true)
	})

	it('rejects other hosts, including subdomains of allowed ones', () => {
		expect(checkHost('https://evil.test/x', ['api.fake.test'])).toBe(false)
		expect(checkHost('https://sub.api.fake.test/x', ['api.fake.test'])).toBe(false)
	})
})

describe('isSecureScheme', () => {
	it('accepts https', () => {
		expect(isSecureScheme('https://api.fake.test/x')).toBe(true)
	})

	it('rejects http and other schemes', () => {
		expect(isSecureScheme('http://api.fake.test/x')).toBe(false)
		expect(isSecureScheme('ws://api.fake.test/x')).toBe(false)
	})
})

describe('gate (real isolate egress)', () => {
	it('injects auth headers outside the isolate', async () => {
		const { result } = await runGated(
			'async () => (await fetch("https://api.fake.test/v1/me")).json()',
			'secret-token-1'
		)
		// the upstream (fake fetcher) saw the injected header...
		expect(gateCalls).toHaveLength(1)
		expect(gateCalls[0]?.authorization).toBe('Bearer secret-token-1')
		// ...and the isolate's code never set it
		expect((result as { auth: string }).auth).toBe('Bearer secret-token-1')
	})

	it('does not follow redirects across the gate (forwards with redirect: manual)', async () => {
		await runGated('async () => (await fetch("https://api.fake.test/redir")).status', 'redir-token')
		// A 3xx therefore returns un-followed to the isolate; the isolate cannot
		// follow it without re-entering the gate, which re-runs the host check.
		expect(gateCalls[0]?.redirect).toBe('manual')
	})

	it('refuses to attach credentials over http, even to an allowed host', async () => {
		const { result } = await runGated(
			'async () => (await fetch("http://api.fake.test/v1/me")).status',
			'secret-token-http'
		)
		expect(result).toBe(403)
		expect(gateCalls).toHaveLength(0)
	})

	it('rejects non-allowlisted hosts with 403 before any upstream call', async () => {
		const { result } = await runGated(
			'async () => (await fetch("https://evil.test/steal")).status',
			'secret-token-2'
		)
		expect(result).toBe(403)
		expect(gateCalls).toHaveLength(0)
	})

	it('keeps the token unreadable inside the isolate', async () => {
		const { result } = await runGated(
			'async () => ({ token: typeof token, env: typeof env, props: typeof props })',
			'secret-token-3'
		)
		expect(result).toEqual({ token: 'undefined', env: 'undefined', props: 'undefined' })
	})
})
