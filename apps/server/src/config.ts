import { z } from 'zod'

const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(8000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('24h'),
  JWT_REFRESH_TTL: z.string().default('168h'),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_PUBLIC_URL: z.string().default(''),
  MAX_UPLOAD_BYTES: z.coerce.number().int().default(50 * 1024 * 1024),
  /** Directory with the built web app; served when present. */
  WEB_DIST: z.string().default('../web/build/client'),
})

export type Config = z.infer<typeof schema>

let cached: Config | undefined

export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
    }
    cached = parsed.data
  }
  return cached
}
