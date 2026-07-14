/**
 * Token-footprint evals: measure the context cost of a tool set the way the
 * model sees it (name + description + serialized JSON schema), so you can prove
 * and regression-guard the code-mode value proposition.
 *
 * The default counter is a dependency-free ~4-chars-per-token estimate. It is
 * accurate enough for a relative ratio and a CI regression guard, but not for a
 * headline absolute number: inject a real tokenizer (Anthropic's count_tokens
 * endpoint, js-tiktoken) for that.
 */

export type TokenCounter = (text: string) => number

/** ~4 characters per token, rounded up. Dependency-free; an estimate, not exact. */
export const estimateTokens: TokenCounter = (text) => Math.ceil(text.length / 4)

/** A tool as it appears in an MCP tools/list response. */
export interface ToolShape {
	name: string
	description: string
	inputSchema: unknown
}

/** Serialize one tool the way it is sent to the model in tools/list. */
function serializeTool(tool: ToolShape): string {
	return `${tool.name}\n${tool.description}\n${JSON.stringify(tool.inputSchema)}`
}

/** Total token footprint of a tool set: the sum of each tool's serialized cost. */
export function toolSetTokens(tools: ToolShape[], count: TokenCounter = estimateTokens): number {
	return tools.reduce((total, tool) => total + count(serializeTool(tool)), 0)
}
