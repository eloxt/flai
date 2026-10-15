import { createHmac, timingSafeEqual } from 'node:crypto'
import type { TokenPair } from '@flai/shared'
import bcrypt from 'bcryptjs'
import { jwtVerify, SignJWT } from 'jose'
import { config } from '../config'

/** Minimal user shape needed to mint and check tokens. */
export interface TokenSubject {
  id: string
  email: string
  role: string
  passwordHash: string
  isActive: boolean
  deletedAt: Date | null
}

type Purpose = 'access' | 'refresh'

export interface TokenClaims {
  purpose: Purpose
  credential: string
  sub: string
}

const secret = () => new TextEncoder().encode(config().JWT_SECRET)

/**
 * Binds tokens to the current password hash: changing the password (or rehashing it)
 * revokes every outstanding token without a server-side session table.
 */
export function credentialOf(user: Pick<TokenSubject, 'id' | 'passwordHash'>): string {
  return createHmac('sha256', config().JWT_SECRET).update(`${user.id}\x00${user.passwordHash}`).digest('hex')
}

export function durationSeconds(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim())
  if (!match) throw new Error(`Invalid duration: ${value}`)
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd']
  return Number(match[1]) * unit
}

async function sign(user: TokenSubject, purpose: Purpose, ttlSeconds: number): Promise<string> {
  return new SignJWT({ purpose, credential: credentialOf(user), email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret())
}

export async function issueTokens(user: TokenSubject): Promise<TokenPair> {
  const accessTtl = durationSeconds(config().JWT_ACCESS_TTL)
  return {
    accessToken: await sign(user, 'access', accessTtl),
    refreshToken: await sign(user, 'refresh', durationSeconds(config().JWT_REFRESH_TTL)),
    expiresIn: accessTtl,
  }
}

/** Verifies signature, algorithm, expiry and purpose. Returns null for any invalid token. */
export async function verifyToken(token: string, purpose: Purpose): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'], requiredClaims: ['exp', 'sub'] })
    if (payload.purpose !== purpose || typeof payload.credential !== 'string' || !payload.sub) return null
    return { purpose, credential: payload.credential, sub: payload.sub }
  } catch {
    return null
  }
}

export function tokenMatchesUser(claims: TokenClaims, user: TokenSubject | undefined): boolean {
  if (!user || !user.isActive || user.deletedAt || user.id !== claims.sub) return false
  const expected = Buffer.from(credentialOf(user))
  const actual = Buffer.from(claims.credential)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// Cost 10 matches Go's bcrypt.DefaultCost, so hashes migrated from the old backend verify as-is.
export const hashPassword = (password: string) => bcrypt.hash(password, 10)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)
