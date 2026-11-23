import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LoginForm } from '@/components/login-form'
import { getActor, homePathForRole } from '@/lib/server/auth'

export default async function LoginPage() {
  let actor = null
  try {
    actor = await getActor()
  } catch {
    actor = null
  }
  if (actor) redirect(homePathForRole(actor.role))
  return <Suspense fallback={null}><LoginForm /></Suspense>
}
