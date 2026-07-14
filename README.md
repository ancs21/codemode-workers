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

Three invariants, all integration-tested against real isolates:

1. Fresh isolate per call. No state crosses calls; code is compiled, never `eval`'d.
2. `search` isolates have `globalOutbound: null` — no network, ever.
3. Credentials live in the gate's props, outside the sandbox. The gate 403s any non-allowlisted host before the request leaves.

## Requirements

Cloudflare Workers with the Worker Loader binding (`worker_loaders`), currently in beta. Node 22+, TypeScript 7.

## Develop

```
npm install
npm test        # vitest via @cloudflare/vitest-pool-workers (real isolates)
npm run check   # typecheck + tests
npm run build   # emit dist/
```
