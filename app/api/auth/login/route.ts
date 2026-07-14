import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getActor } from '@/lib/server/auth'
import { loginRedirectPath } from '@/lib/server/login-redirect'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  ephisId: z.string().trim().regex(/^\d+$/, 'กรุณากรอกรหัส E-Phis เป็นตัวเลข'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

function loginUrl(request: Request, nextPath: string | null, error?: string) {
  const url = new URL('/login', request.url)
  if (nextPath) url.searchParams.set('next', nextPath)
  if (error) url.searchParams.set('error', error)
  return url
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const nextValue = formData.get('next')
  const nextPath = typeof nextValue === 'string' ? nextValue : null

  try {
    const input = schema.parse({
      ephisId: formData.get('ephisId'),
      password: formData.get('password'),
    })
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: `${input.ephisId}@nipt.cbh.go.th`,
      password: input.password,
    })
    if (error) return NextResponse.redirect(loginUrl(request, nextPath, 'E-Phis หรือรหัสผ่านไม่ถูกต้อง'), 303)
    const actor = await getActor()
    if (!actor) {
      await supabase.auth.signOut()
      return NextResponse.redirect(loginUrl(request, nextPath, 'บัญชีนี้ยังไม่มีสิทธิ์เข้า Molecular-CBH QMS กรุณาติดต่อ Admin'), 303)
    }
    return NextResponse.redirect(new URL(loginRedirectPath(actor.role, nextPath), request.url), 303)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'กรุณาตรวจสอบข้อมูลที่กรอก' : 'เข้าสู่ระบบไม่สำเร็จ / Login failed'
    return NextResponse.redirect(loginUrl(request, nextPath, message), 303)
  }
}

