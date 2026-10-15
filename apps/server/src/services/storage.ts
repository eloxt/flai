import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from '../config'
import { AppError } from '../lib/errors'

let client: S3Client | undefined

function s3(): S3Client {
  const cfg = config()
  if (!cfg.S3_BUCKET || !cfg.S3_ACCESS_KEY) throw new AppError('NOT_CONFIGURED', 'File storage is not configured')
  client ??= new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY },
  })
  return client
}

export function publicUrl(key: string): string {
  return config().S3_PUBLIC_URL.replace(/\/?$/, '/') + key
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: config().S3_BUCKET, Key: key, Body: body, ContentType: contentType }))
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: config().S3_BUCKET, Key: key }))
}
