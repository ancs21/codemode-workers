import { env } from 'cloudflare:test'
import type { WorkerLoaderLike } from '../../src/isolate'

/** Typed view of the test worker's bindings (wrangler.jsonc). */
export const LOADER = (env as { LOADER: WorkerLoaderLike }).LOADER
