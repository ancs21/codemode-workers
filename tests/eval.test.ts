import { describe, expect, it } from 'vitest'
import { estimateTokens, toolSetTokens, type ToolShape } from '../src/eval'

const tool = (
  name: string,
  description: string,
  inputSchema: unknown,
): ToolShape => ({
  name,
  description,
  inputSchema,
})

describe('estimateTokens', () => {
  it('approximates ~4 characters per token, rounding up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('toolSetTokens', () => {
  it('is 0 for an empty tool set', () => {
    expect(toolSetTokens([])).toBe(0)
  })

  it('counts name + description + serialized schema per tool', () => {
    const t = tool('search', 'find endpoints', { type: 'object' })
    // serialized: "search\nfind endpoints\n{\"type\":\"object\"}"
    const serialized = 'search\nfind endpoints\n{"type":"object"}'
    expect(toolSetTokens([t])).toBe(estimateTokens(serialized))
  })

  it('sums across tools', () => {
    const a = tool('a', 'x', {})
    const b = tool('b', 'y', {})
    expect(toolSetTokens([a, b])).toBe(toolSetTokens([a]) + toolSetTokens([b]))
  })

  it('uses an injected token counter', () => {
    const oneEach: (text: string) => number = () => 1
    expect(
      toolSetTokens([tool('a', 'b', {}), tool('c', 'd', {})], oneEach),
    ).toBe(2)
  })
})
