import { runMorningDigest } from '@/lib/server/calendar'
import { requireCronSecret } from '@/lib/server/cron'
import { respond } from '@/lib/server/route'

// Scheduled in vercel.json for 07:30 Asia/Bangkok. Idempotent per day via bm_calendar_digest_runs.
export async function GET(request: Request) {
  return respond(async () => {
    requireCronSecret(request)
    return runMorningDigest()
  })
}
