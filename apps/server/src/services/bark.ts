const TIMEOUT_MS = 10_000

/** Push a notification through a Bark server. Throws with a readable message on failure. */
export async function sendBark(barkUrl: string, title: string, body: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(barkUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body, group: 'Flai' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(`Bark request failed: ${(error as Error).message}`)
  }
  if (res.status !== 200) throw new Error(`Bark returned HTTP ${res.status}`)
  let result: { code?: number }
  try {
    result = (await res.json()) as { code?: number }
  } catch {
    throw new Error('Invalid Bark response')
  }
  if (result.code !== 200) throw new Error(`Bark returned code ${result.code}`)
}
