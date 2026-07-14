import { defineConfig } from "blume";

export default defineConfig({
  title: "codemode-workers",
  description:
    "Expose any API to an LLM agent as two sandboxed MCP tools (search + execute) on Cloudflare Workers.",
  github: {
    owner: "ancs21",
    repo: "codemode-workers",
    branch: "main",
    // The Blume project lives in docs/; point Edit-this-page links there.
    dir: "docs",
  },
});
