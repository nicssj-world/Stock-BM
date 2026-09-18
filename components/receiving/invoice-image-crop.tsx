'use client'

import { useRef, useState } from 'react'
import { Check, Crop, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react'
import { Button, Card, Notice, StatusBadge } from '@/components/ui'
import {
  detectDocumentCorners,
  type CropCorners,
  type CropPoint,
  type ImageSize,
  rectifyPerspectiveImage,
  resetCropCorners,
  validatePerspectiveInput,
} from '@/lib/receiving/document-crop'

type CornerKey = keyof CropCorners

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

export function InvoiceImageCrop({ onConfirmed }: { onConfirmed?: (result: InvoiceImageCropResult) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
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

  function clearWorkflow() {
    setOriginalImage(null)
    setProcessedImage(null)
    setAutoCorners(null)
    setCropCorners(null)
    setImageSize(null)
    setShowOriginal(true)
    setDetectionMessage(null)
    setError(null)
    setDragging(null)
  }

  function chooseImage(file: File | null) {
    if (!file || !file.type.startsWith('image/')) {
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
      setDetectionMessage('กำลังตรวจหาขอบเอกสาร…')
      setError(null)
    }
    reader.onerror = () => setError('อ่านไฟล์ภาพไม่สำเร็จ')
    reader.readAsDataURL(file)
  }

  function onOriginalLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    sourceImageRef.current = image
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setImageSize(size)
    const detected = detectDocumentCorners(image)
    setAutoCorners(detected)
    setCropCorners(resetCropCorners(detected))
    setDetectionMessage(detected ? 'พบขอบเอกสารเบื้องต้น — ตรวจและลากมุมทั้ง 4 ได้' : 'ไม่พบขอบเอกสารอัตโนมัติ — ปรับมุมทั้ง 4 ด้วยตนเองได้')
  }

  function displayedImageRect() {
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame || !imageSize) return null
    const scale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height)
    const width = imageSize.width * scale
    const height = imageSize.height * scale
    return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height, frameWidth: frame.width, frameHeight: frame.height }
  }

  function pointerToNormalized(event: React.PointerEvent) {
    const rect = displayedImageRect()
    if (!rect) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - (frameRef.current?.getBoundingClientRect().left ?? 0) - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - (frameRef.current?.getBoundingClientRect().top ?? 0) - rect.top) / rect.height)),
    }
  }

  function framePercent(point: CropPoint) {
    const rect = displayedImageRect()
    if (!rect) return { left: point.x * 100, top: point.y * 100 }
    return { left: ((rect.left + point.x * rect.width) / rect.frameWidth) * 100, top: ((rect.top + point.y * rect.height) / rect.frameHeight) * 100 }
  }

  function beginDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(key)
  }

  function moveDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    if (dragging !== key || !cropCorners) return
    const next = pointerToNormalized(event)
    if (!next) return
    setCropCorners((current) => current ? { ...current, [key]: next } : current)
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(null)
  }

  function resetCorners() {
    setCropCorners(resetCropCorners(autoCorners))
    setError(null)
  }

  function skipCrop() {
    if (!originalImage) return
    setProcessedImage(originalImage)
    setShowOriginal(false)
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
      onConfirmed?.({ originalImage, cropCorners, processedImage: rectified.dataUrl, skipped: false })
    } catch (rectifyError) {
      setError(rectifyError instanceof Error ? rectifyError.message : 'แก้ภาพ perspective ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const previewImage = showOriginal ? originalImage : processedImage ?? originalImage
  const framePoints = cropCorners ? cornerKeys.map((key) => framePercent(cropCorners[key])).map((point) => `${point.left},${point.top}`).join(' ') : ''

  return <Card className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Invoice image capture</p><h3 className="mt-1 text-base font-bold text-[#173d50]">เตรียมภาพก่อน OCR</h3><p className="mt-1 text-xs leading-5 text-[#81979c]">ระบบจะไม่ส่งภาพต้นฉบับเข้า OCR จนกว่าจะยืนยัน crop หรือเลือก Skip Crop</p></div>{processedImage ? <StatusBadge tone="accepted" label="ยืนยันภาพสำหรับ OCR แล้ว" /> : originalImage ? <StatusBadge tone="warning" label="รอยืนยัน crop" /> : null}</div>
    <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { chooseImage(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} />
    {!originalImage ? <Button type="button" onClick={() => inputRef.current?.click()}><Upload className="size-4" />Capture / Select Invoice Image</Button> : null}
    {originalImage ? <>
      {detectionMessage ? <Notice tone={autoCorners ? 'info' : 'warning'}>{detectionMessage}</Notice> : null}
      <div ref={frameRef} className="relative aspect-[4/3] max-h-[70vh] min-h-[220px] overflow-hidden rounded-md border border-[#c9dadd] bg-[#eff4f4] select-none">
        {previewImage ? <img src={previewImage} alt="Invoice preview" className="absolute inset-0 h-full w-full object-contain" style={{ imageOrientation: 'from-image' }} onLoad={showOriginal ? onOriginalLoad : undefined} /> : null}
        {showOriginal && cropCorners ? <><svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><polyline points={framePoints} fill="rgba(11,127,118,.12)" stroke="#0b7f76" strokeWidth="0.5" /></svg>{cornerKeys.map((key) => { const point = framePercent(cropCorners[key]); return <button key={key} type="button" aria-label={`ลากมุม ${cornerLabels[key]}`} className="absolute z-10 size-11 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-[#0b7f76] shadow-lg" style={{ left: `${point.left}%`, top: `${point.top}%` }} onPointerDown={(event) => beginDrag(key, event)} onPointerMove={(event) => moveDrag(key, event)} onPointerUp={endDrag} onPointerCancel={endDrag} /> })}</> : null}
        {!showOriginal && processedImage ? <div className="absolute bottom-2 left-2 rounded-full bg-[#173d50]/85 px-2.5 py-1 text-[11px] font-semibold text-white">Preview corrected image</div> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={resetCorners}><RotateCcw className="size-4" />ใช้ Auto Crop / Reset corners</Button>{processedImage ? <Button type="button" variant="secondary" onClick={() => setShowOriginal((current) => !current)}>{showOriginal ? <ImageIcon className="size-4" /> : <Crop className="size-4" />}{showOriginal ? 'Preview corrected image' : 'Original image'}</Button> : null}<Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><Upload className="size-4" />Retake / Choose another image</Button><Button type="button" variant="ghost" disabled={busy} onClick={skipCrop}><X className="size-4" />Skip Crop</Button><Button type="button" disabled={busy || !cropCorners} onClick={confirmCrop}><Check className="size-4" />Confirm Crop</Button></div>
    </> : null}
  </Card>
}
