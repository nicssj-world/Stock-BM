import { z } from 'zod'
import { getActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { readJson, respond } from '@/lib/server/route'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  ephisId: z.string().trim().regex(/^\d+$/, 'กรุณากรอกรหัส E-Phis เป็นตัวเลข'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

export async function POST(request: Request) {
  return respond(async () => {
    const input = await readJson(request, schema)
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: `${input.ephisId}@nipt.cbh.go.th`,
      password: input.password,
    })
    if (error) throw new HttpError(401, 'E-Phis หรือรหัสผ่านไม่ถูกต้อง')
    const actor = await getActor()
    if (!actor) {
      await supabase.auth.signOut()
      throw new HttpError(403, 'บัญชีนี้ยังไม่มีสิทธิ์เข้า Stock-BM กรุณาติดต่อ Admin')
    }
    return { actor }
  })
}

