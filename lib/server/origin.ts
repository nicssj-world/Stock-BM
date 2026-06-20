import 'server-only'

import { headers } from 'next/headers'

// Absolute origin of the current request (e.g. https://app.example.com), used to
// build QR deep-links. Read from forwarded headers so it matches the deploy domain.
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  if (!host) return ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}
