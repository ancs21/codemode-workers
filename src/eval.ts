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

import type { ProcessedSpec } from './catalog'

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
export function toolSetTokens(
  tools: ToolShape[],
  count: TokenCounter = estimateTokens,
): number {
  return tools.reduce((total, tool) => total + count(serializeTool(tool)), 0)
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']

interface Operation {
  summary?: string
  description?: string
  parameters?: Array<{ name?: string; required?: boolean; schema?: unknown }>
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: unknown }>
  }
}

/** Turn a path + method into a tool name, e.g. get /widgets/{id} -> get_widgets_id. */
function toolName(method: string, path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `${method}_${slug}`
}

function bodySchema(op: Operation): unknown | undefined {
  return op.requestBody?.content?.['application/json']?.schema
}

/** Build the JSON schema a one-tool-per-endpoint server would expose for an operation. */
function nativeSchema(op: Operation, minimal: boolean): unknown {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of op.parameters ?? []) {
    if (!param.name) continue
    if (minimal && !param.required) continue
    properties[param.name] = minimal
      ? { type: (param.schema as { type?: string })?.type }
      : param.schema
    if (param.required) required.push(param.name)
  }

  // The request body is the bulk of a full schema and the main driver of the
  // full-vs-minimal gap, so the minimal baseline omits it entirely.
  if (!minimal) {
    const body = bodySchema(op)
    if (body !== undefined) {
      properties.body = body
      if (op.requestBody?.required) required.push('body')
    }
  }

  return { type: 'object', properties, required }
}

/**
 * Generate the one-tool-per-endpoint baseline that code mode replaces, from a
 * processed spec. `minimal` keeps only required params and drops request-body
 * schemas (the ~5x-smaller variant); the default includes full schemas.
 */
export function nativeToolsFromSpec(
  spec: ProcessedSpec,
  options?: { minimal?: boolean },
): ToolShape[] {
  const minimal = options?.minimal ?? false
  const tools: ToolShape[] = []

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as Operation | undefined
      if (!op) continue
      tools.push({
        name: toolName(method, path),
        description: op.summary ?? op.description ?? '',
        inputSchema: nativeSchema(op, minimal),
      })
    }
  }

  return tools
}

export interface FootprintComparison {
  /** Token footprint of the code-mode tool set (search/execute/docs). */
  codeModeTokens: number
  /** Token footprint of the one-tool-per-endpoint baseline. */
  nativeTokens: number
  /** Number of endpoints in the baseline. */
  endpointCount: number
  /** nativeTokens / codeModeTokens — how many times cheaper code mode is. */
  ratio: number
}

/** Compare the code-mode tool footprint against the native baseline for a spec. */
export function compareFootprint(
  codeModeTools: ToolShape[],
  spec: ProcessedSpec,
  options?: { minimal?: boolean; count?: TokenCounter },
): FootprintComparison {
  const count = options?.count ?? estimateTokens
  const native = nativeToolsFromSpec(spec, { minimal: options?.minimal })
  const codeModeTokens = toolSetTokens(codeModeTools, count)
  const nativeTokens = toolSetTokens(native, count)
  return {
    codeModeTokens,
    nativeTokens,
    endpointCount: native.length,
    ratio: nativeTokens / Math.max(1, codeModeTokens),
  }
}
