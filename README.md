# mcp-codemode

Toolkit for building Code Mode MCP servers on Cloudflare Workers: expose an API with thousands of endpoints to an agent as **two tools** (`search` + `execute`) instead of thousands of tool schemas. The catalog stays server side; the agent writes JavaScript that runs in disposable dynamic-worker isolates. Same pattern as [cloudflare-mcp](https://github.com/cloudflare/cloudflare-mcp) (2,500 endpoints in ~1,100 tokens), packaged for any API.

## How it works

- `search`: agent code runs in an isolate with your catalog baked in as a global. No network access at all.
- `execute`: agent code calls `api.request({ method, path, query, body })`. The isolate's only network exit is a gate you re-export as a WorkerEntrypoint: it rejects every host but yours and injects credentials from props, so agent code can neither read the secret nor reach anywhere else.
- Every call gets a fresh isolate (random id, code compiled into the module source — no `eval`). Results are clamped to a token budget.

## Quickstart

```jsonc
// wrangler.jsonc
{
  "worker_loaders": [{ "binding": "LOADER" }],
  "services": [{ "binding": "GATE_SELF", "service": "<your-worker>", "entrypoint": "Gate" }]
}
```

```ts
import { exports } from 'cloudflare:workers'
import { createGate, processSpec, registerCodemodeTools } from 'mcp-codemode'

export const Gate = createGate({ allowedHosts: ['api.example.com'] })

registerCodemodeTools(server, {
  loader: env.LOADER,
  catalog: {
    get: async () => processSpec(await (await fetch(SPEC_URL)).json()),
    description: 'Your API catalog: spec.paths[path][method].'
  },
  api: {
    baseUrl: 'https://api.example.com/v1',
    outbound: () => exports.Gate({ props: { headers: { Authorization: `Bearer ${env.API_TOKEN}` } } })
  }
})
```

`server` is anything with `registerTool(name, config, cb)` — the official MCP SDK qualifies. See `examples/petstore/worker.ts` for a full worker.

## API

| Export | What it does |
| --- | --- |
| `registerCodemodeTools(server, config)` | Registers `search` + `execute` on an MCP server |
| `createGate({ allowedHosts, fetcher? })` | Egress gate class: host allowlist + header injection from props |
| `runInIsolate(loader, { code, globals, prelude, outbound })` | Run agent code in a fresh isolate (network off by default) |
| `processSpec(spec)` / `resolveRefs(value, spec)` | Reduce an OpenAPI spec to a searchable catalog, refs inlined |
| `buildModuleSource(options)` | The module-text builder underneath `runInIsolate` |
| `truncateResponse(value, { maxTokens })` | Token-budget clamp used on all tool results |

## Security model

Invariants, all integration-tested against real isolates:

1. Fresh isolate per call. No state crosses calls; code is compiled, never `eval`'d.
2. `search` isolates have `globalOutbound: null`: no network, ever.
3. Credentials live in the gate's props, outside the sandbox. Agent code cannot read the token (verified) or the `env`/`props`.
4. The gate 403s any non-allowlisted host before the request leaves, refuses to attach credentials over a non-https scheme, and forwards with `redirect: 'manual'` so a 3xx never carries the credential to another host.

### Residual risks (know these before you ship)

- **Host allowlist is by hostname, not host:port** (matching the cloudflare-mcp pattern). If the allowlisted host also serves other things on other ports, agent code can reach them with the credential attached. Pin the port yourself (pass `host:port` and match `url.host`) if that matters for your API.
- **A leaked credential is recoverable if the allowlisted API reflects request headers** (debug/echo endpoints, verbose error bodies that quote the auth header). This is inherent to any credential-injecting proxy. Confirm your API has no header-reflecting surface, and scope the injected token to least privilege.
- **`api.request` returns upstream error bodies to the agent.** By design (the agent needs to see what failed), but it means anything the upstream reflects on error is agent-readable.
- **Execution timeout is opt-in** (`timeoutMs`). Without it, the platform CPU limit is the only backstop against long-running agent code. Set MCP-level rate limiting at the operator layer.

## Evals

The whole point of code mode is token efficiency, so the library ships a way to measure it. `compareFootprint` weighs the code-mode tool set against the one-tool-per-endpoint baseline generated from the same spec:

```ts
import { compareFootprint, processSpec } from 'mcp-codemode'

const spec = processSpec(await (await fetch(SPEC_URL)).json())
const { codeModeTokens, nativeTokens, endpointCount, ratio } = compareFootprint(myTools, spec)
```

`bun run eval:tokens [specUrl]` prints the table for any spec. Against the Urantia Papers API:

```
Endpoints: 58
Code mode (2 tools):     184 tokens
Native, full schemas:    3,489 tokens   (19x more)
Native, minimal schemas: 1,747 tokens   (9x more)
```

Token counts default to a dependency-free `chars/4` estimate. That is accurate enough for the ratio and for a CI regression guard (see `tests/eval-regression.test.ts`, which fails if a description bloats or the ratio collapses), but not for a headline absolute number: pass Anthropic's `count_tokens` (or `js-tiktoken`) as the `count` argument to get the exact model-facing figure.

This is the deterministic, no-API-key half of evals. The other half — does a real model actually find the right endpoint through `search` — needs a model in the loop, your API keys, and money, so it is left to you. The clean way to score it is not an LLM judge: run the model's generated code through the same gate spy the tests use and assert the resulting request, exactly like `tests/gate.test.ts` and `tests/tools.test.ts` already do deterministically.

## Requirements

Cloudflare Workers with the Worker Loader binding (`worker_loaders`), currently in beta. Bun 1.3+, TypeScript 7.

## Develop

```
bun install
bun run test     # vitest via @cloudflare/vitest-pool-workers (real isolates)
bun run check    # typecheck + tests
bun run build    # emit dist/
```

Tests run in workerd through `@cloudflare/vitest-pool-workers`; bun is the package manager and script runner, vitest stays the test runner.
