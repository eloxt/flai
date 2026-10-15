/**
 * The generation bus behaves the same in memory and on Redis Streams. The Redis run needs a server:
 *   FLAI_TEST_REDIS_URL=redis://127.0.0.1:56379 pnpm test
 */
import { afterAll, describe, expect, it } from 'vitest'
import { type Chunk, createGenerationBus, type GenerationBus, type StreamEntry } from '../src/llm/stream-bus'

const REDIS_URL = process.env.FLAI_TEST_REDIS_URL

const text = (delta: string): Chunk => ({ type: 'text-delta', id: 't', delta })

async function collect(entries: AsyncGenerator<StreamEntry>, limit = Infinity): Promise<StreamEntry[]> {
  const out: StreamEntry[] = []
  for await (const entry of entries) {
    out.push(entry)
    if (out.length >= limit) break
  }
  return out
}

const variants: Array<[string, (() => GenerationBus) | null]> = [
  ['memory', () => createGenerationBus()],
  ['redis', REDIS_URL ? () => createGenerationBus({ redisUrl: REDIS_URL, prefix: `flai-test-${Date.now()}:` }) : null],
]

for (const [name, make] of variants) {
  const suite = make ? describe : describe.skip
  suite(`generation bus (${name})`, () => {
    const bus = make?.() as GenerationBus
    afterAll(() => bus?.shutdown())
    const open = (assistantId: string, conversationId = `c-${assistantId}`) =>
      bus.open({ assistantId, userId: 'u1', conversationId, parentId: 'p1' })

    it('replays from the start, follows live chunks and stops at the end', async () => {
      await open('a1')
      bus.append('a1', text('he'))
      const reading = collect(bus.read('a1', '0', new AbortController().signal))
      bus.append('a1', text('llo'))
      await bus.close('a1')
      const entries = await reading
      expect(entries.map((e) => e.chunk)).toEqual([text('he'), text('llo')])
      expect(entries.every((e) => e.id)).toBe(true)
    })

    it('resumes after a position without repeating chunks', async () => {
      await open('a2')
      for (const part of ['a', 'b', 'c']) bus.append('a2', text(part))
      await bus.close('a2')
      const [first] = await collect(bus.read('a2', '0', new AbortController().signal), 1)
      const rest = await collect(bus.read('a2', first!.id, new AbortController().signal))
      expect(rest.map((e) => (e.chunk as { delta: string }).delta)).toEqual(['b', 'c'])
    })

    it('tracks the active reply per conversation until it closes', async () => {
      await open('a3', 'conv-3')
      expect(await bus.active('conv-3')).toMatchObject({ assistantId: 'a3', parentId: 'p1', done: false })
      await bus.close('a3')
      expect(await bus.active('conv-3')).toBeNull()
      expect(await bus.info('a3')).toMatchObject({ done: true, userId: 'u1' })
    })

    it('delivers cancel requests to the owner and remembers them', async () => {
      const heard: string[] = []
      await bus.onCancel((id, reason) => heard.push(`${id}:${reason}`))
      await open('a4')
      await bus.requestCancel('a4', 'user')
      await expect.poll(() => heard).toContain('a4:user')
      expect(await bus.heartbeat('a4')).toBe('user')
      await bus.close('a4')
    })

    it('stops reading when the reader goes away', async () => {
      await open('a5')
      const controller = new AbortController()
      const reading = collect(bus.read('a5', '0', controller.signal))
      setTimeout(() => controller.abort(), 50)
      expect(await reading).toEqual([])
      await bus.close('a5')
    })
  })
}
