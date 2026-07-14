import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // vitest config runs in Node; .env isn't in process.env, so load it explicitly.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
    test: {
      globals: true,
      include: ['tests/**/*.test.ts'],
      reporters: [
        'default',
        [
          '@devant-net/vitest-reporter',
          {
            apiUrl: env.DEVANT_CLOUD_API_URL ?? 'https://oss.devant.net',
            projectId: Number(env.DEVANT_CLOUD_PROJECT_ID ?? 3),
            apiToken: env.DEVANT_CLOUD_TOKEN,
          },
        ],
      ],
      coverage: {
        // The workers pool runs in workerd, so v8 coverage is unavailable; use istanbul.
        provider: 'istanbul',
        include: ['src/**/*.ts'],
        reporter: ['text-summary', 'lcov', 'json-summary'],
      },
    },
  }
})
