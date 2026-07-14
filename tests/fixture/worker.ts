/**
 * Test fixture worker. vitest-pool-workers needs a main module; the library
 * itself is exercised directly from test files (which also run inside workerd).
 */
export default {
	fetch(): Response {
		return new Response('mcp-codemode test fixture')
	}
}
