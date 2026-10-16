import { describe, expect, it } from 'vitest'
import { isPublicAddress, safeFetch } from '../src/llm/safe-fetch'

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '192.0.2.1', '198.19.0.0', '198.19.255.255', '203.0.113.5', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fc00::1',
    '2001:db8::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2002::1', 'not-an-ip',
  ])('rejects %s', (ip) => expect(isPublicAddress(ip)).toBe(false))

  it.each(['8.8.8.8', '1.1.1.1', '198.18.0.0', '198.18.0.1', '198.18.255.255', '::ffff:198.18.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('accepts %s', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  )
})

describe('safeFetch', () => {
  it('refuses literal private addresses and non-http schemes', async () => {
    await expect(safeFetch('http://127.0.0.1:1/x')).rejects.toThrow(/public/)
    await expect(safeFetch('http://[::1]:1/x')).rejects.toThrow(/public/)
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/http/)
    await expect(safeFetch('http://user:pw@example.com/')).rejects.toThrow(/Credentials/)
  })

  it('refuses hostnames that resolve to private addresses', async () => {
    await expect(safeFetch('http://localhost:1/x')).rejects.toThrow()
  })
})
