'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PenLine, RotateCcw } from 'lucide-react'
import { api } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { toSignaturePng } from '@/lib/signature-png'

type SignatureState = { status: 'loading' | 'ready' | 'error'; signature: string | null }

// One request per page load, shared by every signing field on the page.
let cached: Promise<string | null> | null = null
// Once loaded, fields opened later on the same page render it straight away.
let known: { signature: string | null } | null = null
const listeners = new Set<(signature: string | null) => void>()

function loadMySignature() {
  cached ??= api<{ signature: string | null }>('/api/me/signature')
    .then((result) => { known = { signature: result.signature }; return result.signature })
    .catch((error) => { cached = null; throw error })
  return cached
}

/** Seed the value already known (after saving it, or in a server-rendered preview). */
export function primeMySignature(signature: string | null) {
  known = { signature }
  cached = Promise.resolve(signature)
  for (const listener of listeners) listener(signature)
}

/** The signed-in user's saved signature (data URL) and a way to save a new one. */
export function useMySignature() {
  const [state, setState] = useState<SignatureState>(() => (known ? { status: 'ready', signature: known.signature } : { status: 'loading', signature: null }))
  useEffect(() => {
    let alive = true
    const listener = (signature: string | null) => { if (alive) setState({ status: 'ready', signature }) }
    listeners.add(listener)
    loadMySignature().then(listener, () => { if (alive) setState({ status: 'error', signature: null }) })
    return () => { alive = false; listeners.delete(listener) }
  }, [])
  const save = useCallback(async (file: File) => {
    const png = await toSignaturePng(file)
    await api('/api/me/signature', { method: 'PUT', body: JSON.stringify({ signaturePng: png }) })
    primeMySignature(png)
  }, [])
  return { ...state, save }
}

export interface MySignatureHandle {
  /** Sign with the saved signature: the server reads it, nothing is uploaded. */
  usesSaved: () => boolean
  /** True when a saved signature is chosen or something has been drawn. */
  isReady: () => boolean
  drawnFile: () => Promise<File | null>
  /** After a successful drawn signing: keep it as "my signature" when asked. Never throws. */
  rememberIfRequested: (file: File | null) => Promise<boolean>
}

/**
 * Signature input for when the signer is the signed-in user: one tap to use the
 * saved signature, or draw (and optionally keep it for next time).
 */
export function MySignatureField({ label, onReady }: { label: string; onReady: (handle: MySignatureHandle) => void }) {
  const mine = useMySignature()
  const [drawing, setDrawing] = useState(false)
  const [remember, setRemember] = useState(true)
  const pad = useRef<SignaturePadHandle | null>(null)
  const onPadReady = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])
  const hasSaved = mine.status === 'ready' && Boolean(mine.signature)
  const useSaved = hasSaved && !drawing
  const state = useRef({ useSaved, remember, save: mine.save })
  useEffect(() => { state.current = { useSaved, remember, save: mine.save } }, [useSaved, remember, mine.save])

  useEffect(() => {
    onReady({
      usesSaved: () => state.current.useSaved,
      isReady: () => state.current.useSaved || pad.current?.isEmpty() === false,
      drawnFile: async () => (state.current.useSaved ? null : (await pad.current?.toFile()) ?? null),
      rememberIfRequested: async (file) => {
        if (!file || state.current.useSaved || !state.current.remember) return false
        try { await state.current.save(file); return true } catch { return false }
      },
    })
  }, [onReady])

  function drawInstead() {
    setDrawing(true)
    setRemember(false)
  }

  if (mine.status === 'loading') return <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-[#cddfe0] bg-[#fbfdfd] text-xs text-[#789097]" role="status">กำลังโหลดลายเซ็นของคุณ…</div>

  if (useSaved) {
    return (
      <div className="rounded-lg border border-[#b9ded8] bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#315763]">{label}</p>
          <span className="text-[11px] font-semibold text-[#0b7f76]">ลายเซ็นที่บันทึกไว้</span>
        </div>
        <div className="mt-2 flex h-24 items-center justify-center rounded-md border border-dashed border-[#b9d6d0] bg-[#fbfefc] p-2">
          <Image src={mine.signature!} alt="ลายเซ็นที่บันทึกไว้ของคุณ" width={450} height={130} unoptimized className="h-auto max-h-full w-auto max-w-full object-contain" />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          <button type="button" onClick={drawInstead} className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-[#58747d] hover:text-[#173d50] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"><PenLine className="size-3.5" aria-hidden="true" />วาดใหม่สำหรับครั้งนี้</button>
          <Link href="/my-signature" className="inline-flex min-h-11 items-center text-xs font-semibold text-[#0b7f76] hover:underline">จัดการลายเซ็นของฉัน</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <SignaturePad label={label} onReady={onPadReady} />
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs text-[#3f5c64]">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-[#0b7f76]" />
          {hasSaved ? 'แทนที่ลายเซ็นที่บันทึกไว้ด้วยลายเซ็นนี้' : 'เก็บลายเซ็นนี้ไว้ใช้ครั้งต่อไป (ไม่ต้องวาดใหม่)'}
        </label>
        {hasSaved ? <button type="button" onClick={() => setDrawing(false)} className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-[#0b7f76] hover:underline focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"><RotateCcw className="size-3.5" aria-hidden="true" />ใช้ลายเซ็นที่บันทึกไว้</button> : null}
      </div>
      {mine.status === 'error' ? <p className="text-[11px] text-[#a83541]">โหลดลายเซ็นที่บันทึกไว้ไม่สำเร็จ · วาดลายเซ็นแทนได้</p> : null}
    </div>
  )
}
