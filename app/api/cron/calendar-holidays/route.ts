import { syncGoogleHolidays } from '@/lib/server/calendar'
import { requireCronSecret } from '@/lib/server/cron'
import { respond } from '@/lib/server/route'

// Scheduled in vercel.json for 03:00 Asia/Bangkok.
export async function GET(request: Request) {
  return respond(async () => {
    requireCronSecret(request)
    return syncGoogleHolidays(null)
  })
}
