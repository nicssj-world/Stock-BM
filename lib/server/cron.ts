import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { HttpError } from '@/lib/server/errors'

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function requireCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured')
  const header = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(401, 'Unauthorized')
}
