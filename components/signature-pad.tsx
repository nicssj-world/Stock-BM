'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

export interface SignaturePadHandle { toFile: () => Promise<File | null>; isEmpty: () => boolean }

export function SignaturePad({ label, onReady }: { label: string; onReady: (handle: SignaturePadHandle) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const empty = useRef(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const snapshot = empty.current ? null : canvas.toDataURL('image/png')
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#173d50'; context.lineWidth = 2.2
      if (snapshot) { const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height); image.src = snapshot }
    }
    resize()
    window.addEventListener('resize', resize)
    const handle: SignaturePadHandle = {
      isEmpty: () => empty.current,
      toFile: () => new Promise((resolve) => { if (empty.current) return resolve(null); canvas.toBlob((blob) => resolve(blob ? new File([blob], 'signature.png', { type: 'image/png' }) : null), 'image/png') }),
    }
    onReady(handle)
    return () => window.removeEventListener('resize', resize)
  }, [onReady, revision])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const p = point(event); const ctx = canvasRef.current?.getContext('2d'); ctx?.beginPath(); ctx?.moveTo(p.x, p.y) }
  function move(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const p = point(event); const ctx = canvasRef.current?.getContext('2d'); ctx?.lineTo(p.x, p.y); ctx?.stroke(); empty.current = false }
  function stop() { drawing.current = false }
  function clear() { const canvas = canvasRef.current; if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); empty.current = true; setRevision((value) => value + 1) }

  return <div className="rounded-xl border border-[#cddfe0] bg-white p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold text-[#315763]">{label}</p><button type="button" onClick={clear} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#6d858d] hover:bg-[#eef5f4]"><Eraser className="size-3.5" /> ล้าง</button></div><canvas ref={canvasRef} aria-label={label} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} className="h-36 w-full touch-none rounded-lg border border-dashed border-[#9fbfc0] bg-[linear-gradient(#fff,#fbfdfd)]" /><p className="mt-2 text-[11px] text-[#8ba0a5]">เซ็นด้วยนิ้วหรือปากกาบนพื้นที่ด้านบน</p></div>
}
