'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Crop, Image as ImageIcon, RotateCcw, X } from 'lucide-react'
import { Button, Card, Notice, StatusBadge } from '@/components/ui'
import {
  calculateLoupeViewportPosition,
  applyCropDrag,
  clampCropPoint,
  detectDocumentCorners,
  type CropCorners,
  type CropPoint,
  type ImageSize,
  rectifyPerspectiveImage,
  resetCropCorners,
  validatePerspectiveInput,
} from '@/lib/receiving/document-crop'

type CornerKey = keyof CropCorners

type LoupeState = {
  key: CornerKey
  point: CropPoint
  clientX: number
  clientY: number
}

export type InvoiceImageCropResult = {
  originalImage: string
  cropCorners: CropCorners | null
  processedImage: string
  skipped: boolean
}

const cornerKeys: CornerKey[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
const cornerLabels: Record<CornerKey, string> = {
  topLeft: 'top-left',
  topRight: 'top-right',
  bottomRight: 'bottom-right',
  bottomLeft: 'bottom-left',
}

type DisplayedImageRect = {
  left: number
  top: number
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}

function calculateDisplayedImageRect(frame: DOMRect, imageSize: ImageSize): DisplayedImageRect {
  const scale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height)
  const width = imageSize.width * scale
  const height = imageSize.height * scale
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height, frameWidth: frame.width, frameHeight: frame.height }
}

const FILE_INPUT_CLASS = 'absolute h-px w-px overflow-hidden opacity-0'
const LOUPE_SIZE = 136
const LOUPE_MAGNIFICATION = 2.75
const LOUPE_GAP = 18

function isSupportedImageFile(file: File) {
  return file.type.toLowerCase().startsWith('image/') || /\.(?:heic|heif)$/i.test(file.name)
}

export function InvoiceImageCrop({ onConfirmed }: { onConfirmed?: (result: InvoiceImageCropResult) => void }) {
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [autoCorners, setAutoCorners] = useState<CropCorners | null>(null)
  const [cropCorners, setCropCorners] = useState<CropCorners | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [showOriginal, setShowOriginal] = useState(true)
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<CornerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [displayedRect, setDisplayedRect] = useState<DisplayedImageRect | null>(null)
  const [loupe, setLoupe] = useState<LoupeState | null>(null)
  const dragOffsetRef = useRef<{ key: CornerKey; offset: CropPoint } | null>(null)

  useEffect(() => {
    if (!imageSize || !frameRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const frame = frameRef.current
      if (frame) setDisplayedRect(calculateDisplayedImageRect(frame.getBoundingClientRect(), imageSize))
    })
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [imageSize, originalImage])

  function chooseImage(file: File | null) {
    if (!file || !isSupportedImageFile(file)) {
      setError('กรุณาเลือกไฟล์ภาพ invoice')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : null
      if (!image) {
        setError('อ่านไฟล์ภาพไม่สำเร็จ')
        return
      }
      setOriginalImage(image)
      setProcessedImage(null)
      setAutoCorners(null)
      setCropCorners(null)
      setImageSize(null)
      setShowOriginal(true)
      setLoupe(null)
      dragOffsetRef.current = null
      setDragging(null)
      setDetectionMessage('กำลังตรวจหาขอบเอกสาร…')
      setError(null)
    }
    reader.onerror = () => setError('อ่านไฟล์ภาพไม่สำเร็จ')
    reader.readAsDataURL(file)
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    if (!file) return
    chooseImage(file)
    event.currentTarget.value = ''
  }

  function onOriginalLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    sourceImageRef.current = image
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setImageSize(size)
    const detected = detectDocumentCorners(image)
    setAutoCorners(detected)
    setCropCorners(resetCropCorners(detected))
    setDetectionMessage(detected ? 'ตรวจพบขอบเอกสารอัตโนมัติ — ปรับมุมได้หากจำเป็น' : 'ไม่พบขอบเอกสารอัตโนมัติ — กรุณาปรับมุมทั้ง 4 ด้วยตนเอง')
  }

  function currentDisplayedImageRect() {
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame || !imageSize) return null
    return calculateDisplayedImageRect(frame, imageSize)
  }

  function pointerToNormalized(event: React.PointerEvent) {
    const rect = currentDisplayedImageRect()
    if (!rect) return null
    return clampCropPoint({
      x: Math.min(1, Math.max(0, (event.clientX - (frameRef.current?.getBoundingClientRect().left ?? 0) - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - (frameRef.current?.getBoundingClientRect().top ?? 0) - rect.top) / rect.height)),
    })
  }

  function framePercent(point: CropPoint, rect: DisplayedImageRect | null) {
    if (!rect) return { left: point.x * 100, top: point.y * 100 }
    return { left: ((rect.left + point.x * rect.width) / rect.frameWidth) * 100, top: ((rect.top + point.y * rect.height) / rect.frameHeight) * 100 }
  }

  function beginDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    const currentPoint = cropCorners?.[key]
    const pointer = pointerToNormalized(event)
    if (!currentPoint) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.touchAction = 'none'
    dragOffsetRef.current = {
      key,
      offset: pointer ? { x: currentPoint.x - pointer.x, y: currentPoint.y - pointer.y } : { x: 0, y: 0 },
    }
    setDragging(key)
    setLoupe({ key, point: currentPoint, clientX: event.clientX, clientY: event.clientY })
  }

  function moveDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragOffsetRef.current
    if (!activeDrag || activeDrag.key !== key || !cropCorners) return
    const pointer = pointerToNormalized(event)
    if (!pointer) return
    const next = applyCropDrag(pointer, activeDrag.offset)
    setCropCorners((current) => current ? { ...current, [key]: next } : current)
    setLoupe({ key, point: next, clientX: event.clientX, clientY: event.clientY })
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.style.touchAction = 'pan-y'
    dragOffsetRef.current = null
    setDragging(null)
    setLoupe(null)
  }

  function resetCorners() {
    setCropCorners(resetCropCorners(autoCorners))
    setLoupe(null)
    setError(null)
  }

  function skipCrop() {
    if (!originalImage) return
    setProcessedImage(originalImage)
    setShowOriginal(false)
    setLoupe(null)
    setError(null)
    onConfirmed?.({ originalImage, cropCorners: null, processedImage: originalImage, skipped: true })
  }

  function confirmCrop() {
    if (!originalImage || !cropCorners || !imageSize || !sourceImageRef.current) return
    const validation = validatePerspectiveInput(cropCorners, imageSize)
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rectified = rectifyPerspectiveImage(sourceImageRef.current, cropCorners)
      setProcessedImage(rectified.dataUrl)
      setShowOriginal(false)
      setLoupe(null)
      onConfirmed?.({ originalImage, cropCorners, processedImage: rectified.dataUrl, skipped: false })
    } catch (rectifyError) {
      setError(rectifyError instanceof Error ? rectifyError.message : 'แก้ภาพ perspective ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const previewImage = showOriginal ? originalImage : processedImage ?? originalImage
  const framePoints = cropCorners ? cornerKeys.map((key) => framePercent(cropCorners[key], displayedRect)).map((point) => `${point.left},${point.top}`).join(' ') : ''
  const loupePosition = loupe ? calculateLoupeViewportPosition(
    { x: loupe.clientX, y: loupe.clientY },
    typeof window === 'undefined' ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight },
    LOUPE_SIZE,
    LOUPE_GAP,
  ) : null

  return <Card className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Invoice image capture</p><h3 className="mt-1 text-base font-bold text-[#173d50]">เตรียมภาพก่อน OCR</h3><p className="mt-1 text-xs leading-5 text-[#81979c]">ระบบจะไม่ส่งภาพต้นฉบับเข้า OCR จนกว่าจะยืนยัน crop หรือเลือก Skip Crop</p></div>{processedImage ? <StatusBadge tone="accepted" label="ยืนยันภาพสำหรับ OCR แล้ว" /> : originalImage ? <StatusBadge tone="warning" label="รอยืนยัน crop" /> : null}</div>
    <div className="flex flex-wrap gap-2" aria-label="เลือกหรือถ่ายภาพ invoice">
      <label htmlFor="invoice-image-library" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#b8d8d5] bg-white px-3 py-2 text-sm font-semibold text-[#0b7f76] shadow-sm hover:bg-[#f4fbf9] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76]"><ImageIcon className="size-4" aria-hidden="true" />เลือกรูปจากคลังภาพ</label>
      <label htmlFor="invoice-image-camera" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-[#0b7f76] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#096b64] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76]"><Camera className="size-4" aria-hidden="true" />ถ่ายรูปใหม่</label>
      <input id="invoice-image-library" type="file" accept="image/*" className={FILE_INPUT_CLASS} onChange={handleFileSelection} />
      <input id="invoice-image-camera" type="file" accept="image/*" capture="environment" className={FILE_INPUT_CLASS} onChange={handleFileSelection} />
    </div>
    {originalImage ? <>
      {detectionMessage ? <Notice tone={autoCorners ? 'info' : 'warning'}>{detectionMessage}</Notice> : null}
      <div ref={frameRef} className="relative aspect-[4/3] max-h-[70vh] min-h-[220px] overflow-hidden rounded-md border border-[#c9dadd] bg-[#eff4f4] select-none" style={{ touchAction: dragging ? 'none' : 'pan-y' }}>
        {previewImage ? <img src={previewImage} alt="Invoice preview" className="absolute inset-0 h-full w-full object-contain" style={{ imageOrientation: 'from-image' }} onLoad={showOriginal ? onOriginalLoad : undefined} /> : null}
        {showOriginal && cropCorners ? <><svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><polyline points={framePoints} fill="rgba(11,127,118,.12)" stroke="#0b7f76" strokeWidth="0.5" /></svg>{cornerKeys.map((key) => { const point = framePercent(cropCorners[key], displayedRect); return <button key={key} type="button" aria-label={`ลากมุม ${cornerLabels[key]}`} className="absolute z-10 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent p-0" style={{ left: `${point.left}%`, top: `${point.top}%`, touchAction: dragging === key ? 'none' : 'pan-y' }} onPointerDown={(event) => beginDrag(key, event)} onPointerMove={(event) => moveDrag(key, event)} onPointerUp={endDrag} onPointerCancel={endDrag}><span aria-hidden="true" className="pointer-events-none size-7 rounded-full border-2 border-white bg-[#0b7f76] shadow-[0_1px_5px_rgba(0,0,0,.45)]" /></button> })}</> : null}
        {!showOriginal && processedImage ? <div className="absolute bottom-2 left-2 rounded-full bg-[#173d50]/85 px-2.5 py-1 text-[11px] font-semibold text-white">Preview corrected image</div> : null}
      </div>
      {showOriginal && loupe && originalImage && imageSize && loupePosition ? <div aria-hidden="true" className="pointer-events-none fixed z-50 overflow-hidden rounded-full border-4 border-white bg-[#173d50] shadow-2xl" style={{ left: loupePosition.left, top: loupePosition.top, width: LOUPE_SIZE, height: LOUPE_SIZE, backgroundImage: `url(${originalImage})`, backgroundRepeat: 'no-repeat', backgroundSize: `${imageSize.width * LOUPE_MAGNIFICATION}px ${imageSize.height * LOUPE_MAGNIFICATION}px`, backgroundPosition: `${LOUPE_SIZE / 2 - loupe.point.x * imageSize.width * LOUPE_MAGNIFICATION}px ${LOUPE_SIZE / 2 - loupe.point.y * imageSize.height * LOUPE_MAGNIFICATION}px`, imageOrientation: 'from-image' }}><span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80" /><span className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80" /><span className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500 bg-white/30" /></div> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={resetCorners}><RotateCcw className="size-4" />ใช้ Auto Crop / Reset corners</Button>{processedImage ? <Button type="button" variant="secondary" onClick={() => setShowOriginal((current) => !current)}>{showOriginal ? <ImageIcon className="size-4" /> : <Crop className="size-4" />}{showOriginal ? 'Preview corrected image' : 'Original image'}</Button> : null}<Button type="button" variant="ghost" disabled={busy} onClick={skipCrop}><X className="size-4" />Skip Crop</Button><Button type="button" disabled={busy || !cropCorners} onClick={confirmCrop}><Check className="size-4" />Confirm Crop</Button></div>
    </> : null}
  </Card>
}
