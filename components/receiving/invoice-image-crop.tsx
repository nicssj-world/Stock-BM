'use client'

/* eslint-disable @next/next/no-img-element -- local object/data URLs of a just-captured photo cannot go through next/image. */
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Crop, Image as ImageIcon, RefreshCw, RotateCcw, SkipForward } from 'lucide-react'
import { Button, Card, Notice, StatusBadge } from '@/components/ui'
import { readJpegOrientation, type ExifOrientation } from '@/lib/receiving/image-orientation'
import {
  containRect,
  cropRectToPixels,
  dragCropRect,
  FULL_CROP_RECT,
  isFullCrop,
  isSupportedInvoiceImage,
  scaledSize,
  type CropHandle,
  type CropRect,
} from '@/lib/receiving/rect-crop'

/**
 * Invoice photo used as receipt evidence only. It never selects an Item,
 * Catalog/REF, quantity or vendor and never creates receipt lines.
 */
export type InvoiceEvidenceImage = {
  file: File
  previewUrl: string
  skipped: boolean
  cropRect: CropRect
  width: number
  height: number
  sourceFileName: string
  exifOrientation: ExifOrientation | null
}

type WorkingImage = {
  dataUrl: string
  width: number
  height: number
  sourceFileName: string
  exifOrientation: ExifOrientation | null
}

const WORKING_MAX_EDGE = 2400
const JPEG_QUALITY = 0.88
const FILE_INPUT_CLASS = 'absolute h-px w-px overflow-hidden opacity-0'
const CORNERS: Exclude<CropHandle, 'move' | 'n' | 'e' | 's' | 'w'>[] = ['nw', 'ne', 'se', 'sw']
const CORNER_LABELS: Record<string, string> = { nw: 'มุมซ้ายบน', ne: 'มุมขวาบน', se: 'มุมขวาล่าง', sw: 'มุมซ้ายล่าง' }

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    // Browsers apply the EXIF orientation when decoding an <img>, so the
    // natural size and drawImage output are already upright.
    image.style.imageOrientation = 'from-image'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('เปิดไฟล์ภาพไม่สำเร็จ — ลองถ่ายใหม่หรือเลือกไฟล์ JPEG/PNG'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('สร้างไฟล์ภาพไม่สำเร็จ')), 'image/jpeg', JPEG_QUALITY)
  })
}

async function prepareWorkingImage(file: File): Promise<WorkingImage> {
  const header = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const size = scaledSize(image.naturalWidth, image.naturalHeight, WORKING_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('อุปกรณ์นี้ไม่รองรับการเตรียมภาพ')
    context.drawImage(image, 0, 0, size.width, size.height)
    return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: size.width, height: size.height, sourceFileName: file.name || 'invoice.jpg', exifOrientation: readJpegOrientation(header) }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function exportCrop(working: WorkingImage, rect: CropRect, skipped: boolean): Promise<InvoiceEvidenceImage> {
  const image = await loadImage(working.dataUrl)
  const pixels = skipped ? { x: 0, y: 0, width: working.width, height: working.height } : cropRectToPixels(rect, working.width, working.height)
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('อุปกรณ์นี้ไม่รองรับการ crop ภาพ')
  context.drawImage(image, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, pixels.width, pixels.height)
  const blob = await canvasToBlob(canvas)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = new File([blob], `invoice-${skipped ? 'full' : 'crop'}-${stamp}.jpg`, { type: 'image/jpeg' })
  return {
    file,
    previewUrl: canvas.toDataURL('image/jpeg', 0.8),
    skipped,
    cropRect: skipped ? FULL_CROP_RECT : rect,
    width: pixels.width,
    height: pixels.height,
    sourceFileName: working.sourceFileName,
    exifOrientation: working.exifOrientation,
  }
}

export function InvoiceImageCrop({ value, onChange, disabled = false }: { value: InvoiceEvidenceImage | null; onChange: (value: InvoiceEvidenceImage | null) => void; disabled?: boolean }) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ handle: CropHandle; pointerId: number; startX: number; startY: number; startRect: CropRect } | null>(null)
  const [working, setWorking] = useState<WorkingImage | null>(null)
  const [rect, setRect] = useState<CropRect>(FULL_CROP_RECT)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = working !== null

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const update = () => setFrameSize({ width: frame.clientWidth, height: frame.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [working])

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (!file) return
    if (!isSupportedInvoiceImage(file)) {
      setError('กรุณาเลือกไฟล์ภาพใบส่งของ')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await prepareWorkingImage(file)
      setWorking(next)
      setRect(FULL_CROP_RECT)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'เปิดไฟล์ภาพไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function finish(skipped: boolean) {
    if (!working) return
    setBusy(true)
    setError(null)
    try {
      onChange(await exportCrop(working, rect, skipped))
      setWorking(null)
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'crop ภาพไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // Inset the image so corner handles stay fully inside the frame.
  const inset = 20
  const fitted = working ? containRect(Math.max(0, frameSize.width - inset * 2), Math.max(0, frameSize.height - inset * 2), working.width, working.height) : null
  const box = fitted ? { ...fitted, left: fitted.left + inset, top: fitted.top + inset } : null

  function beginDrag(handle: CropHandle, event: React.PointerEvent<HTMLElement>) {
    if (busy || disabled) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startRect: rect }
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !box?.width || !box.height) return
    event.preventDefault()
    setRect(dragCropRect(drag.startRect, drag.handle, (event.clientX - drag.startX) / box.width, (event.clientY - drag.startY) / box.height))
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }

  const pickers = <div className="flex flex-wrap gap-2" aria-label="เลือกหรือถ่ายภาพใบส่งของ">
    <label htmlFor="invoice-image-library" className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#b8d8d5] bg-white px-3 py-2 text-sm font-semibold text-[#0b7f76] shadow-sm hover:bg-[#f4fbf9] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76] ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}><ImageIcon className="size-4" aria-hidden="true" />เลือกรูปจากคลังภาพ</label>
    <label htmlFor="invoice-image-camera" className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-[#0b7f76] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#096b64] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76] ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}><Camera className="size-4" aria-hidden="true" />ถ่ายรูปใหม่</label>
    <input id="invoice-image-library" type="file" accept="image/*" className={FILE_INPUT_CLASS} disabled={disabled || busy} onChange={(event) => void chooseFile(event)} />
    <input id="invoice-image-camera" type="file" accept="image/*" capture="environment" className={FILE_INPUT_CLASS} disabled={disabled || busy} onChange={(event) => void chooseFile(event)} />
  </div>

  return <Card className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Invoice evidence</p>
        <h3 className="mt-1 text-base font-bold text-[#173d50]">รูปใบส่งของ (หลักฐานเท่านั้น)</h3>
        <p className="mt-1 text-xs leading-5 text-[#81979c]">ใช้เป็นหลักฐานแนบใบรับเข้า — ระบบไม่อ่านข้อมูลจากรูป และไม่ใช้กำหนด Item, จำนวน หรือ Vendor</p>
      </div>
      {value && !editing ? <StatusBadge tone="accepted" label={value.skipped ? 'ใช้ภาพเต็ม' : 'crop แล้ว'} /> : editing ? <StatusBadge tone="warning" label="รอยืนยัน crop" /> : null}
    </div>

    {!editing && !value ? pickers : null}

    {editing && working ? <>
      <p className="text-xs text-[#58747d]">ลากกรอบเพื่อเลื่อน และลากมุมทั้ง 4 เพื่อปรับขนาด ให้เหลือเฉพาะใบส่งของ</p>
      <div ref={frameRef} className="relative h-[58vh] max-h-[560px] min-h-[260px] touch-none select-none overflow-hidden rounded-md border border-[#c9dadd] bg-[#1f3440]">
        {box && box.width > 0 ? <div className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
          {/* The working copy is already upright (EXIF applied at decode), so no second rotation. */}
          <img src={working.dataUrl} alt="ภาพใบส่งของก่อน crop" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" style={{ imageOrientation: 'none' }} />
          <div
            role="presentation"
            data-testid="crop-rect"
            className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(8,24,32,.55)] outline outline-1 outline-[#0b7f76]"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
            onPointerDown={(event) => beginDrag('move', event)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
            <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/40" />
            <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
            <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/40" />
            {CORNERS.map((handle) => <button
              key={handle}
              type="button"
              aria-label={`ปรับขนาดกรอบ ${CORNER_LABELS[handle]}`}
              className={`absolute z-10 grid size-11 touch-none place-items-center border-0 bg-transparent p-0 ${handle.includes('n') ? '-top-[22px]' : '-bottom-[22px]'} ${handle.includes('w') ? '-left-[22px]' : '-right-[22px]'}`}
              onPointerDown={(event) => beginDrag(handle, event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            ><span className="pointer-events-none size-[18px] rounded-sm border-2 border-[#0b7f76] bg-white shadow" /></button>)}
          </div>
        </div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || isFullCrop(rect)} onClick={() => setRect(FULL_CROP_RECT)}><RotateCcw className="size-4" />Reset</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void finish(true)}><SkipForward className="size-4" />Skip Crop</Button>
        <Button type="button" disabled={busy} onClick={() => void finish(false)}><Check className="size-4" />Confirm Crop</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setWorking(null); setError(null) }}>ยกเลิก</Button>
      </div>
    </> : null}

    {!editing && value ? <div className="space-y-2">
      <div className="overflow-hidden rounded-md border border-[#c9dadd] bg-[#eff4f4]"><img src={value.previewUrl} alt="ภาพใบส่งของที่จะแนบเป็นหลักฐาน" className="mx-auto max-h-72 w-auto object-contain" /></div>
      <p className="text-[11px] text-[#81979c]">{value.width}×{value.height}px · {value.skipped ? 'ไม่ได้ crop' : 'crop แล้ว'} · แนบเมื่อยืนยันรับสินค้า</p>
      <div className="flex flex-wrap gap-2">
        {pickers}
        <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => onChange(null)}><RefreshCw className="size-4" />นำรูปออก</Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-[#81979c]"><Crop className="size-3" />เลือกหรือถ่ายรูปใหม่เพื่อแทนที่รูปเดิมก่อนยืนยันรับสินค้า</p>
    </div> : null}

    {busy ? <p className="text-xs text-[#58747d]">กำลังเตรียมภาพ…</p> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
  </Card>
}
