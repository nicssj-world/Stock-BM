import { runDigest } from '@/lib/server/calendar'
import { requireCronSecret } from '@/lib/server/cron'
import { respond } from '@/lib/server/route'

// Scheduled in vercel.json for 15:00 Asia/Bangkok: heads-up for tomorrow through the next workday.
// Idempotent per send day via bm_calendar_digest_runs.
export async function GET(request: Request) {
  return respond(async () => {
    requireCronSecret(request)
    return runDigest()
  })
}
