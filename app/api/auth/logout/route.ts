import { respond } from '@/lib/server/route'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  return respond(async () => {
    const supabase = await createClient()
    await supabase.auth.signOut()
    return { ok: true }
  })
}

