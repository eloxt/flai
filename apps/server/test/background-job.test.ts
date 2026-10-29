import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backgroundLoop, processClaims } from '../src/lib/background-job'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('backgroundLoop', () => {
  it('runs after startMs, then every idleMs, and retryMs after a failure', async () => {
    const pass = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined)
    const loop = backgroundLoop('test', { startMs: 10, idleMs: 100, retryMs: 1000, pass })
    loop.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(pass).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(pass).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(pass).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(pass).toHaveBeenCalledTimes(3)
    loop.stop()
  })

  it('nudges only when started and idle, and stops rescheduling once stopped', async () => {
    let finish!: () => void
    const pass = vi.fn((active: () => boolean) => new Promise<void>((resolve) => { finish = () => resolve(void active()) }))
    const loop = backgroundLoop('test', { startMs: 10, idleMs: 100, pass })
    loop.nudge()
    await vi.advanceTimersByTimeAsync(1000)
    expect(pass).not.toHaveBeenCalled()

    loop.start()
    await vi.advanceTimersByTimeAsync(10)
    loop.nudge()
    await vi.advanceTimersByTimeAsync(10)
    expect(pass).toHaveBeenCalledTimes(1)

    const active = pass.mock.calls[0]![0]
    expect(active()).toBe(true)
    loop.stop()
    expect(active()).toBe(false)
    finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(pass).toHaveBeenCalledTimes(1)
  })
})

describe('processClaims', () => {
  it('releases failed claims and carries on with the rest', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const process = vi.fn(async (n: number) => { if (n === 2) throw new Error('bad') })
    const count = await processClaims('test', [1, 2, 3], { id: String, process, release })
    expect(count).toBe(3)
    expect(process).toHaveBeenCalledTimes(3)
    expect(release).toHaveBeenCalledExactlyOnceWith(2)
  })
})
