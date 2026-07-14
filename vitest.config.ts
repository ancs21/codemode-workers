import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      // The workers pool runs in workerd, so v8 coverage is unavailable; use istanbul.
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
    },
  },
})
