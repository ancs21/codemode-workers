import { describe, expect, it } from 'vitest'
import pkg from '../package.json'

describe('package metadata', () => {
  it('has a non-empty description of at most 120 chars', () => {
    // npm renders this as the search-result subtitle; standard-readme caps it at 120.
    expect(pkg.description.length).toBeGreaterThan(0)
    expect(pkg.description.length).toBeLessThanOrEqual(120)
  })
})
