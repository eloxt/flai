import { describe, expect, it } from 'vitest'
import { estimateCost, estimateCostBreakdown, estimateStepsCost, modelCostSchema, reconstructCostBreakdown } from '../models'

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

  it('moves reported tool input out of uncached input without changing the total', () => {
    const usage = { inputTokens: 10_000, cachedInputTokens: 6_000, cacheWriteTokens: 1_000, toolInputTokens: 1_800, outputTokens: 2_000 }
    expect(estimateCostBreakdown(cost, [usage])).toEqual({
      input: 0.0024, cacheRead: 0.003, cacheWrite: 0.0025, toolInput: 0.0036, output: 0.02,
    })
    expect(estimateCost(cost, usage)).toBeCloseTo(estimateCost(cost, { ...usage, toolInputTokens: 0 })!)
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

describe('reconstructCostBreakdown', () => {
  it('uses the recorded total even when current prices give a different total', () => {
    const rates = modelCostSchema.parse({ input: 2, output: 10, cacheRead: 0.5 })
    const result = reconstructCostBreakdown(rates, {
      inputTokens: 44_274, cachedInputTokens: 14_706, outputTokens: 1_895, cost: 0.0597,
    })!
    expect(result.input).toBeGreaterThan(0)
    expect(result.cacheRead).toBeGreaterThan(0)
    expect(result.output).toBeGreaterThan(0)
    expect(Object.values(result).reduce((sum, usd) => sum + usd, 0)).toBeCloseTo(0.0597)
  })

  it('uses the standard tier when the saved cost indicates multiple shorter requests', () => {
    const rates = modelCostSchema.parse({ input: 2, output: 10, contextOver200k: { input: 4, output: 25 } })
    const result = reconstructCostBreakdown(rates, { inputTokens: 310_000, outputTokens: 1_100, cost: 0.631 })
    expect(result?.input).toBeCloseTo(0.62)
    expect(result?.output).toBeCloseTo(0.011)
  })

  it('leaves a positive total unallocated if current rates provide no weights', () => {
    expect(reconstructCostBreakdown(modelCostSchema.parse({}), { inputTokens: 500, cost: 0.01 })).toBeUndefined()
  })
})
