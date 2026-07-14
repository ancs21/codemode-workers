import { describe, expect, it } from 'vitest'
import { truncateResponse } from '../src/truncate'

describe('truncateResponse', () => {
  it('returns short strings unchanged', () => {
    expect(truncateResponse('hello')).toBe('hello')
  })

  it('serializes non-string values as pretty JSON', () => {
    expect(truncateResponse({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('truncates past the default 6000-token cap and appends a notice', () => {
    const text = 'x'.repeat(6000 * 4 + 100)
    const out = truncateResponse(text)
    // payload is clipped to exactly the cap; the notice follows
    expect(out.indexOf('\n\n--- TRUNCATED')).toBe(6000 * 4)
    expect(out).toContain('6,000')
  })

  it('respects a custom token cap', () => {
    const out = truncateResponse('y'.repeat(500), { maxTokens: 100 })
    expect(out).toContain('TRUNCATED')
    expect(out.startsWith('y'.repeat(400))).toBe(true)
  })

  it('keeps content at exactly the cap untouched', () => {
    const text = 'z'.repeat(100 * 4)
    expect(truncateResponse(text, { maxTokens: 100 })).toBe(text)
  })
})
