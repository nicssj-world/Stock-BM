'use client'

import Image from 'next/image'
import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { api, Button, Field, Input, Notice } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { toSignaturePng } from '@/lib/signature-png'

/** The user's own position title and signature, reused when they sign EQA documents, equipment records and vendor reports: draw with a finger or pen, or upload an image. */
export function SignatureSettings({ position, signature }: { position: string | null; signature: string | null }) {
  const router = useRouter()
  const pad = useRef<SignaturePadHandle | null>(null)
  const [title, setTitle] = useState(position ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ready = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])

  function run(work: () => Promise<unknown>, done: string) {
    setError(null); setMessage(null)
    startTransition(async () => {
      try { await work(); setMessage(done); router.refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'ทำรายการไม่สำเร็จ') }
    })
  }
  const put = (body: object) => api('/api/vendors/signer', { method: 'PUT', body: JSON.stringify(body) })
  const saveDrawn = () => run(async () => {
    const file = await pad.current?.toFile()
    if (!file) throw new Error('กรุณาเซ็นชื่อก่อนบันทึก')
    await put({ signaturePng: await toSignaturePng(file) })
  }, 'บันทึกลายเซ็นแล้ว')
  const upload = (file?: File) => { if (file) run(async () => { await put({ signaturePng: await toSignaturePng(file) }) }, 'บันทึกลายเซ็นแล้ว') }

  return <div className="space-y-6">
    <div className="space-y-3"><div><h3 className="font-bold text-[#173d50]">ตำแหน่ง</h3><p className="text-sm text-[#6a838c]">แสดงใต้ชื่อบนรายงานประเมินผู้ขาย · ต้องมีตำแหน่งจึงถูกเลือกเป็นผู้ลงนามได้</p></div>
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-56 flex-1"><Field label="ตำแหน่ง"><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น นักเทคนิคการแพทย์ชำนาญการ" /></Field></div><Button type="button" disabled={pending} onClick={() => run(() => put({ position: title }), 'บันทึกตำแหน่งแล้ว')}>บันทึกตำแหน่ง</Button></div></div>

    <div className="space-y-3"><div><h3 className="font-bold text-[#173d50]">ลายเซ็น</h3><p className="text-sm text-[#6a838c]">ใช้เมื่อคุณกดลงนามเอกสาร EQA บันทึกงานเครื่องมือ (ผู้รับงาน) และรายงานประเมินผู้ขาย · เห็นได้เฉพาะเจ้าของ · เอกสารที่ลงนามแล้วเก็บสำเนาลายเซ็น ณ เวลาที่ลงนาม การเปลี่ยนลายเซ็นภายหลังจึงไม่กระทบเอกสารเดิม</p></div>
      <div className="space-y-2 rounded-xl border border-[#d3e1e3] p-3"><p className="text-xs text-[#81979c]">ลายเซ็นปัจจุบัน</p>
        {signature ? <div className="grid justify-items-start gap-2"><Image src={signature} alt="ลายเซ็นปัจจุบันของคุณ" width={450} height={130} unoptimized className="h-auto max-h-24 w-auto rounded border border-[#d3e1e3] bg-white" /><Button type="button" variant="secondary" disabled={pending} onClick={() => { if (window.confirm('ลบลายเซ็นของคุณ?')) run(() => api('/api/vendors/signer', { method: 'DELETE' }), 'ลบลายเซ็นแล้ว') }}>ลบลายเซ็น</Button></div> : <p className="text-sm text-[#6a838c]">ยังไม่มีลายเซ็น</p>}</div>
      <SignaturePad label="เซ็นใหม่ด้วยนิ้วหรือปากกา" onReady={ready} />
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending} onClick={saveDrawn}>บันทึกลายเซ็นที่เซ็น</Button></div>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-[#58747d]">หรืออัปโหลดรูปลายเซ็น (PNG, JPG, WebP)</span><input className="block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} /></label></div>
    {message && <Notice tone="success">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
  </div>
}
