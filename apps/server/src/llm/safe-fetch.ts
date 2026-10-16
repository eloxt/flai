import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

/**
 * Fetch for user-supplied endpoints (MCP servers and remote images):
 * - only public addresses or the allowed 198.18.0.0/16 Fake-IP range are dialled;
 *   other DNS answers are discarded, and the validated address is the one dialled
 *   (no DNS rebinding window);
 * - environment proxies are not used;
 * - redirects stay on the same origin unless explicitly allowed, at most 5 hops;
 * - response headers must arrive within 30s.
 */

const denied = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  // Allow 198.18.* for local Fake-IP proxies; keep the rest of the benchmark range blocked.
  ['198.19.0.0', 16],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  denied.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['2001:db8::', 32],
  ['2001::', 23],
  ['2002::', 16],
] as const) {
  denied.addSubnet(net, prefix, 'ipv6')
}
const globalUnicast6 = new BlockList()
globalUnicast6.addSubnet('2000::', 3, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  const ip = mapped ? mapped[1]! : address
  const family = isIP(ip)
  if (family === 4) return !denied.check(ip, 'ipv4')
  if (family === 6) return globalUnicast6.check(ip, 'ipv6') && !denied.check(ip, 'ipv6')
  return false
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

function safeLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, [])
    if (addresses.length === 0) return callback(new Error('Endpoint hostname has no addresses'), [])
    const allowed = addresses.filter((a) => isPublicAddress(a.address))
    if (allowed.length === 0) {
      return callback(new Error('Endpoint must resolve to public addresses only'), [])
    }
    if (options.all) return callback(null, allowed)
    callback(null, allowed[0]!.address, allowed[0]!.family)
  })
}

const agent = new Agent({
  connect: { lookup: safeLookup as never, timeout: 10_000 },
  headersTimeout: 30_000,
})

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) endpoints are allowed')
  if (url.username || url.password) throw new Error('Credentials in endpoint URLs are not allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  // Literal IPs never reach the DNS lookup hook, so check them here.
  if (isIP(host) && !isPublicAddress(host)) throw new Error('Endpoint must be a public address')
}

const MAX_REDIRECTS = 5

export async function safeFetch(
  input: string | URL | Request,
  init?: RequestInit,
  policy: { allowCrossOriginRedirects?: boolean } = {},
): Promise<Response> {
  const request = input instanceof Request ? input : undefined
  let url = new URL(request ? request.url : input.toString())
  const origin = url.origin
  let options: RequestInit = { ...(request ? { method: request.method, headers: request.headers } : {}), ...init }

  for (let hop = 0; ; hop++) {
    assertAllowedUrl(url)
    const res = (await undiciFetch(url, {
      ...(options as object),
      redirect: 'manual',
      dispatcher: agent,
    })) as unknown as Response
    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) return res

    const next = new URL(res.headers.get('location')!, url)
    await res.body?.cancel()
    if (hop + 1 >= MAX_REDIRECTS || (!policy.allowCrossOriginRedirects && next.origin !== origin)) {
      throw new Error('Cross-origin or excessive redirect rejected')
    }
    if (next.origin !== url.origin) {
      const headers = new Headers(options.headers)
      for (const name of ['authorization', 'proxy-authorization', 'cookie', 'referer']) headers.delete(name)
      options = { ...options, headers }
    }
    if (res.status === 303) options = { ...options, method: 'GET', body: undefined }
    url = next
  }
}
