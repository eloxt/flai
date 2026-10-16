import type { LookupAddress } from 'node:dns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Lookup = (host: string, options: { all?: boolean }, callback: (error: Error | null, addresses: string | LookupAddress[], family?: number) => void) => void
const state = vi.hoisted(() => ({ dns: vi.fn(), lookup: undefined as Lookup | undefined }))
vi.mock('node:dns', () => ({ lookup: state.dns }))
vi.mock('undici', () => ({
  Agent: class {
    constructor(options: { connect: { lookup: Lookup } }) { state.lookup = options.connect.lookup }
  },
  fetch: vi.fn(),
}))
import '../src/llm/safe-fetch'

beforeEach(() => { state.dns.mockReset() })

describe('validated DNS addresses used by the network agent', () => {
  it('keeps the working Fake-IP IPv4 when DNS also returns a private IPv6', () => {
    state.dns.mockImplementation((_host, _options, callback) => callback(null, [
      { address: 'fc00::2478', family: 6 },
      { address: '198.18.64.56', family: 4 },
    ]))
    const callback = vi.fn()
    state.lookup!('www.discoverhongkong.com', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '198.18.64.56', family: 4 }])
  })

  it('only returns validated addresses in both single-address and multi-address modes', () => {
    state.dns.mockImplementation((_host, _options, callback) => callback(null, [
      { address: '127.0.0.1', family: 4 },
      { address: '169.254.169.254', family: 4 },
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]))
    const single = vi.fn()
    state.lookup!('mixed.example', {}, single)
    expect(single).toHaveBeenCalledWith(null, '8.8.8.8', 4)
    const all = vi.fn()
    state.lookup!('mixed.example', { all: true }, all)
    expect(all).toHaveBeenCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ])
  })

  it('still rejects domains with only blocked addresses', () => {
    state.dns.mockImplementation((_host, _options, callback) => callback(null, [
      { address: '192.168.1.1', family: 4 },
      { address: 'fc00::2478', family: 6 },
    ]))
    const callback = vi.fn()
    state.lookup!('private.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: 'Endpoint must resolve to public addresses only' }), [])
  })

  it('rejects empty answers and preserves DNS errors', () => {
    state.dns.mockImplementationOnce((_host, _options, callback) => callback(null, []))
    const empty = vi.fn()
    state.lookup!('empty.example', {}, empty)
    expect(empty).toHaveBeenCalledWith(expect.objectContaining({ message: 'Endpoint hostname has no addresses' }), [])
    const error = new Error('DNS unavailable')
    state.dns.mockImplementationOnce((_host, _options, callback) => callback(error))
    const failed = vi.fn()
    state.lookup!('failed.example', {}, failed)
    expect(failed).toHaveBeenCalledWith(error, [])
  })
})
