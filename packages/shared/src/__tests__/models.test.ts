import { describe, expect, it } from 'vitest'
import { estimateCost, estimateStepsCost, modelCostSchema } from '../models'

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

describe('estimateStepsCost', () => {
  const tiered = modelCostSchema.parse({ input: 2, output: 10, contextOver200k: { input: 4, output: 20 } })

  it('picks the price tier per step, not from the summed input', () => {
    const steps = [
      { inputTokens: 150_000, outputTokens: 100 },
      { inputTokens: 160_000, outputTokens: 1_000 },
    ]
    expect(estimateStepsCost(tiered, steps)).toBeCloseTo((310_000 * 2 + 1_100 * 10) / 1e6)
  })

  it('uses the long-context tier only for the steps past 200k', () => {
    const steps = [
      { inputTokens: 190_000, outputTokens: 100 },
      { inputTokens: 210_000, outputTokens: 1_000 },
    ]
    expect(estimateStepsCost(tiered, steps)).toBeCloseTo((190_000 * 2 + 100 * 10 + 210_000 * 4 + 1_000 * 20) / 1e6)
  })

  it('has nothing to say without usage', () => {
    expect(estimateStepsCost(tiered, [])).toBeUndefined()
    expect(estimateStepsCost(tiered, [{}])).toBeUndefined()
  })
})
