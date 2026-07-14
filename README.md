# codemode-workers

Expose any API to an LLM agent as two sandboxed MCP tools (search + execute) on Cloudflare Workers.

[![CI](https://github.com/ancs21/codemode-workers/actions/workflows/ci.yml/badge.svg)](https://github.com/ancs21/codemode-workers/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/codemode-workers)](https://www.npmjs.com/package/codemode-workers)
[![types included](https://img.shields.io/npm/types/codemode-workers)](https://www.npmjs.com/package/codemode-workers)
[![docs](https://img.shields.io/badge/docs-codemode--workers.pages.dev-0b7285)](https://codemode-workers.pages.dev)
[![license MIT](https://img.shields.io/npm/l/codemode-workers)](./LICENSE)

Instead of registering thousands of tool schemas, you register two tools (`search` + `execute`). The catalog stays on the server; the agent writes JavaScript that runs in a fresh, sandboxed isolate. Same pattern as [cloudflare-mcp](https://github.com/cloudflare/mcp), packaged for any API.

Docs: **[codemode-workers.pages.dev](https://codemode-workers.pages.dev)**

## Why

One tool per endpoint dumps every schema into the model's context. Code mode keeps the spec server-side and sends two tools, so the context cost stays flat however big the API is. Against the Urantia Papers API (58 endpoints):

| Approach                    | Tools | Tokens |
| --------------------------- | ----- | ------ |
| One tool per endpoint, full | 58    | 3,489  |
| Code mode                   | 2     | 184    |

Run `bun run eval:tokens <specUrl>` to measure it for your own API.

## Install

```
npm install codemode-workers
```

Bring your own MCP server SDK (e.g. `@modelcontextprotocol/server`). The library only needs a `registerTool(name, config, cb)`.

## Usage

```jsonc
// wrangler.jsonc
{
  "worker_loaders": [{ "binding": "LOADER" }],
  "services": [
    {
      "binding": "GATE_SELF",
      "service": "<your-worker>",
      "entrypoint": "Gate",
    },
  ],
}
```

```ts
import { exports } from 'cloudflare:workers'
import {
  createGate,
  processSpec,
  registerCodemodeTools,
} from 'codemode-workers'

export const Gate = createGate({ allowedHosts: ['api.example.com'] })

registerCodemodeTools(server, {
  loader: env.LOADER,
  catalog: {
    get: async () => processSpec(await (await fetch(SPEC_URL)).json()),
  },
  api: {
    baseUrl: 'https://api.example.com/v1',
    outbound: () =>
      exports.Gate({
        props: { headers: { Authorization: `Bearer ${env.API_TOKEN}` } },
      }),
  },
})
```

`search` runs code over your catalog with no network. `execute` calls the API through the gate, which allowlists your host and injects the credential that the agent never sees. Full walkthrough and API reference in the [docs](https://codemode-workers.pages.dev).

## Security

The credential lives in the gate, outside the sandbox, so agent code cannot read the token or reach any host but yours. `search` has no network. Every call is a fresh isolate. Details and residual risks: [codemode-workers.pages.dev/security](https://codemode-workers.pages.dev/security).

## Develop

```
bun install
bun run check   # typecheck + tests (workerd via @cloudflare/vitest-pool-workers)
```

## License

MIT. See [LICENSE](./LICENSE).
