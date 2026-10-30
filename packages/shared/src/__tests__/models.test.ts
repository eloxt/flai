import { describe, expect, it } from 'vitest'
import { estimateCost, modelCostSchema } from '../models'

describe('estimateCost', () => {
  const cost = modelCostSchema.parse({ input: 2, output: 10, cacheRead: 0.5, cacheWrite: 2.5 })

  it('prices uncached input, cache reads and writes, and output separately', () => {
    const usd = estimateCost(cost, { inputTokens: 10_000, cachedInputTokens: 6_000, cacheWriteTokens: 1_000, outputTokens: 2_000 })
    // 3k uncached × $2 + 6k read × $0.5 + 1k written × $2.5 + 2k out × $10, per million
    expect(usd).toBeCloseTo((3_000 * 2 + 6_000 * 0.5 + 1_000 * 2.5 + 2_000 * 10) / 1e6)
  })

  it('charges cache tokens at the input price when the model lists no cache prices', () => {
    const plain = modelCostSchema.parse({ input: 2, output: 10 })
    expect(estimateCost(plain, { inputTokens: 1_000, cachedInputTokens: 400, outputTokens: 0 })).toBeCloseTo(0.002)
  })

  it('uses the long-context tier past 200k input tokens', () => {
    const tiered = modelCostSchema.parse({ input: 2, output: 10, contextOver200k: { input: 4, output: 20 } })
    expect(estimateCost(tiered, { inputTokens: 300_000, outputTokens: 1_000 })).toBeCloseTo((300_000 * 4 + 1_000 * 20) / 1e6)
  })

  it('has nothing to say without usage', () => {
    expect(estimateCost(cost, {})).toBeUndefined()
  })
})
