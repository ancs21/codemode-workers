/**
 * Token-footprint eval: fetch a real OpenAPI spec, measure the code-mode tool
 * footprint against the one-tool-per-endpoint baseline, and print the table.
 *
 *   bun run eval:tokens [specUrl]
 *
 * Uses the chars/4 estimate (dependency-free). For the exact number a model
 * sees, pass Anthropic's count_tokens as the `count` argument to compareFootprint.
 */
import { compareFootprint, type ToolShape } from '../src/eval'
import { processSpec } from '../src/catalog'
import { registerCodemodeTools, type ToolRegistrar } from '../src/tools'
import type { WorkerLoaderLike } from '../src/isolate'

const SPEC_URL = process.argv[2] ?? 'https://api.urantia.dev/openapi.json'
const API_BASE = new URL(SPEC_URL).origin

/** Register the code-mode tools on a capturing server and read back their shapes. */
function codeModeTools(catalogDescription: string): ToolShape[] {
  const captured = new Map<string, string>()
  const server: ToolRegistrar = {
    registerTool(name, config) {
      captured.set(name, config.description)
      return undefined
    },
  }
  registerCodemodeTools(server, {
    loader: {} as WorkerLoaderLike,
    catalog: { get: () => ({}), description: catalogDescription },
    api: { baseUrl: API_BASE, outbound: () => ({}), description: SPEC_URL },
  })
  // The code input schema is fixed and trivial; the descriptions carry the cost.
  const inputSchema = {
    type: 'object',
    properties: { code: { type: 'string' } },
    required: ['code'],
  }
  return [...captured].map(([name, description]) => ({
    name,
    description,
    inputSchema,
  }))
}

const raw = (await (await fetch(SPEC_URL)).json()) as Record<string, unknown>
const spec = processSpec(raw)
const tools = codeModeTools(
  `OpenAPI catalog for ${SPEC_URL}. spec.paths[path][method].`,
)

const full = compareFootprint(tools, spec)
const minimal = compareFootprint(tools, spec, { minimal: true })

console.log(`Spec:      ${SPEC_URL}`)
console.log(`Endpoints: ${full.endpointCount}`)
console.log('')
console.log(
  `Code mode (${tools.length} tools):     ${full.codeModeTokens.toLocaleString()} tokens`,
)
console.log(
  `Native, full schemas:    ${full.nativeTokens.toLocaleString()} tokens   (${full.ratio.toFixed(0)}x more)`,
)
console.log(
  `Native, minimal schemas: ${minimal.nativeTokens.toLocaleString()} tokens   (${minimal.ratio.toFixed(0)}x more)`,
)
console.log('')
console.log(
  '(chars/4 estimate; inject Anthropic count_tokens for the exact model-facing number)',
)
