const CHARS_PER_TOKEN = 4
const DEFAULT_MAX_TOKENS = 6000

export interface TruncateOptions {
	maxTokens?: number
}

/**
 * Serialize a tool result and clamp it to a token budget (~4 chars/token).
 * Oversized results get a notice telling the agent to narrow its query.
 */
export function truncateResponse(content: unknown, options?: TruncateOptions): string {
	const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS
	const maxChars = maxTokens * CHARS_PER_TOKEN
	const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

	if (text.length <= maxChars) {
		return text
	}

	const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN)
	return `${text.slice(0, maxChars)}\n\n--- TRUNCATED ---\nResponse was ~${estimatedTokens.toLocaleString()} tokens (limit: ${maxTokens.toLocaleString()}). Use more specific queries to reduce response size.`
}
