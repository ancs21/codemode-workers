import { describe, expect, it } from 'vitest'
import * as api from '../src/index'

/**
 * The package's public contract. If a refactor drops or renames one of these,
 * consumers break — this guard fails first.
 */
const EXPECTED_FUNCTIONS = [
	'registerCodemodeTools',
	'createGate',
	'checkHost',
	'isSecureScheme',
	'runInIsolate',
	'withTimeout',
	'buildModuleSource',
	'processSpec',
	'resolveRefs',
	'truncateResponse',
	'estimateTokens',
	'toolSetTokens',
	'nativeToolsFromSpec',
	'compareFootprint'
] as const

describe('public API surface', () => {
	it('exports every documented function', () => {
		const record = api as Record<string, unknown>
		const missing = EXPECTED_FUNCTIONS.filter((name) => typeof record[name] !== 'function')
		expect(missing).toEqual([])
	})

	it('does not export anything undeclared (guards accidental leaks)', () => {
		const runtimeExports = Object.keys(api).sort()
		expect(runtimeExports).toEqual([...EXPECTED_FUNCTIONS].sort())
	})
})
