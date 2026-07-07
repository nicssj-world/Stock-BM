'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlaskConical, KeyRound, ScanLine, ShieldCheck, UserRound } from 'lucide-react'
import { api, Button, Input, Notice } from '@/components/ui'

function safeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) return '/dashboard'
  return nextPath
}

function landingPath(role: string, nextPath: string | null) {
  if (role === 'Assistant') return '/hpv'
  return safeNextPath(nextPath)
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const [ephisId, setEphisId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api<{ actor: { role: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ ephisId, password }) })
      window.location.replace(landingPath(result.actor.role, searchParams.get('next')))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'เข้าสู่ระบบไม่สำเร็จ / Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf2f1] px-4 py-8">
      <div className="absolute inset-0 opacity-75 [background-image:linear-gradient(#d1e3e1_1px,transparent_1px),linear-gradient(90deg,#d1e3e1_1px,transparent_1px)] [background-size:28px_28px]" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-lg border border-[#d4e3e4] bg-white shadow-[0_30px_90px_rgba(17,62,71,0.14)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-[#123944] p-9 text-white lg:block">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[#0b7f76]"><FlaskConical className="size-6" /></div>
          <p className="mt-20 text-xs font-bold tracking-[0.2em] text-[#7ee3d8] uppercase">Molecular Lab Quality</p>
          <h1 className="mt-3 text-4xl font-bold">Molecular-CBH QMS<br />Chonburi Hospital</h1>
          <p className="mt-4 max-w-sm text-sm leading-7 text-[#b6d2d8]">ระบบบริหารคุณภาพห้องแลปอณูชีววิทยา — Stock, IQC และ EQA พร้อม lot, expiry, audit trail</p>
          <div className="mt-16 grid grid-cols-3 gap-3">
            {[['01', 'Scan'], ['02', 'FEFO'], ['03', 'Audit']].map(([number, label]) => (
              <div key={number} className="border-t border-white/20 pt-3">
                <p className="mono text-xs text-[#7ee3d8]">{number}</p>
                <p className="mt-1 text-xs font-semibold text-[#d1e4e8]">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-8 sm:px-10 sm:py-12">
          <p className="text-xs font-bold tracking-[0.18em] text-[#0b7f76] uppercase">Secure workspace</p>
          <h2 className="mt-2 text-3xl font-bold text-[#173d50]">เข้าสู่ระบบ / Login</h2>
          <p className="mt-2 text-sm text-[#6e858d]">ใช้รหัส E-Phis และรหัสผ่านชุดเดียวกับ Genomic-CBH</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#57737c]">E-Phis</span>
              <div className="relative"><UserRound className="absolute top-2.5 left-3 size-4 text-[#88a1a7]" /><Input autoFocus inputMode="numeric" value={ephisId} onChange={(event) => setEphisId(event.target.value)} className="pl-9" /></div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#57737c]">Password</span>
              <div className="relative"><KeyRound className="absolute top-2.5 left-3 size-4 text-[#88a1a7]" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" /></div>
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button disabled={busy} className="mt-2 w-full py-2.5">{busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ / Sign in'}</Button>
          </form>
          <div className="mt-9 grid grid-cols-2 gap-3 border-t border-[#e2ebec] pt-5 text-[11px] text-[#799096]">
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#0b7f76]" /> Supabase Auth</span>
            <span className="flex items-center gap-1.5"><ScanLine className="size-3.5 text-[#0b7f76]" /> Scanner ready</span>
          </div>
        </div>
      </section>
    </main>
  )
}

